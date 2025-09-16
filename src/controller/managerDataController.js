import { deleteFromTable, existsAnyDataInRange, existsAnyCsvDateInTable } from "../model/tableModel.js";
import {
  iniciarBarra,
  atualizarBarra,
  finalizarBarra,
} from "../utils/progressBar.js";

import { addAviso, addErro, addInfo } from "../middleware/errorHandler.js";
import { logActivity } from "../middleware/logger.js";
import streamPipeline, {
  POOL_MAX,
  INSERT_MAX_CONCURRENT,
  FILES_MAX_CONCURRENT,
} from "../utils/streamPipeline.js";
import {
  detectDelimiter,
  detectEncoding,
} from "../utils/prepareStreamByFilepath.js";
import {
  loadDecimalProfilesFromSchema,
  expandTiposWithSchema,
} from "../model/tableModel.js";
import {
  PIPELINE_FAST_PATH,
  BATCH_SIZE,
  HIGH_WATERMARK_DEFAULT,
  LOW_WATERMARK_DEFAULT,
} from "../../config/index.js";
import { updateActiveJob } from "../utils/queueTracker.js";
import { normalizeTotal } from "../utils/normalizeTotal.js";

export async function manageInsertController(metadados, logData) {
  const contexto = metadados.caminho_original;
  const nomeArquivo = metadados.nome_arquivo ?? "arquivo-desconhecido";
  const barraId = `${nomeArquivo}::${metadados.ano ?? "-"}::${metadados.tabela}`;

  console.log(`[DB] Using pool limit=${POOL_MAX} | insert_concurrency=${INSERT_MAX_CONCURRENT} | files_concurrency=${FILES_MAX_CONCURRENT}`);
  addInfo(
    `Configuração: INSERT_MAX_CONCURRENT=${INSERT_MAX_CONCURRENT}, FILES_MAX_CONCURRENT=${FILES_MAX_CONCURRENT}, BATCH_SIZE=${BATCH_SIZE}, QUEUE_HIGH_WATERMARK=${HIGH_WATERMARK_DEFAULT}, QUEUE_LOW_WATERMARK=${LOW_WATERMARK_DEFAULT}`,
    contexto,
  );
  void logActivity("info", "Preparação iniciada", { filePath: contexto });
  updateActiveJob(contexto, { stage: "preparação", detail: "Coletando metadados" });

  // -------- Barra global: 0..100 (3 fases) --------
  const PHASES = { prep: 15, read: 45, insert: 40 }; // soma 100
  let phaseBase = 0;
  let phaseSpan = PHASES.prep;
  let lastPctAbs = 0;
  const stageNames = { prep: "preparação", read: "leitura", insert: "inserção" };
  let currentStageName = stageNames.prep;

  iniciarBarra(barraId, 100, nomeArquivo, metadados.tabela, metadados.ano);

  function setPhase(name) {
    phaseBase += phaseSpan;
    phaseSpan = PHASES[name];
    currentStageName = stageNames[name] || name;
    updateActiveJob(contexto, { stage: currentStageName });
  }
  function publish(percent0to1, statusText) {
    const abs = Math.max(0, Math.min(100, Math.floor(phaseBase + percent0to1 * phaseSpan)));
    const delta = abs - lastPctAbs;
    if (delta > 0) {
      atualizarBarra(barraId, delta, statusText);
      lastPctAbs = abs;
    } else if (statusText) {
      atualizarBarra(barraId, 0, statusText);
    }
    const progress = abs / 100;
    updateActiveJob(contexto, {
      progress,
      stage: currentStageName,
      detail: statusText || currentStageName,
    });
  }

  try {
    // -------- Fase 1: preparação --------
    let { encoding, delimiter } = metadados;

    publish(0.1, encoding ? `Encoding: ${encoding}` : "Detectando encoding...");
    if (!encoding) {
      ({ encoding } = await detectEncoding(contexto));
    }

    publish(
      0.4,
      delimiter
        ? `Encoding: ${encoding} | Delimitador: ${delimiter}`
        : `Encoding: ${encoding} | Detectando delimitador...`,
    );
    if (!delimiter) {
      delimiter = await detectDelimiter(contexto, encoding);
    }

    publish(0.8, `Delimitador: ${delimiter}`);
    metadados.encoding = encoding;
    metadados.delimiter = delimiter;
    const headersNorm = metadados.colunas_json;
    updateActiveJob(contexto, { detail: `Encoding ${encoding} | Delimitador ${delimiter}` });

    // Tipos esperados (schema + overrides)
    const schemaMap = await loadDecimalProfilesFromSchema(metadados.tabela);
    const tiposFinal = expandTiposWithSchema(metadados.tipos_esperados, schemaMap);
    void logActivity("info", "Preparação concluída", { filePath: contexto });

    publish(1.0, "Preparação concluída");
    setPhase("read"); // 15..60%
    void logActivity("info", "Leitura e validação iniciadas", { filePath: contexto });

    // -------- Valida dados e ação --------
    let totalKnown = normalizeTotal(metadados.total_linhas);
    let totalIsKnown = totalKnown != null;
    let totalDisplay = totalIsKnown ? String(totalKnown) : "-";
    let totalForReturn = totalKnown ?? 0;

    const progressLogState = new Map();

    function shouldLogUnknownDelta(nextValue, lastValue) {
      if (!Number.isFinite(nextValue)) return false;
      if (lastValue == null) return true;
      return nextValue - lastValue >= 1000;
    }

    function logProgress(stageName, statusText, primaryLabel, primaryValue) {
      if (!Number.isFinite(primaryValue)) return;

      const state = progressLogState.get(stageName) || {
        lastPercent: null,
        lastValue: null,
        logged: false,
      };

      const percentVal =
        totalIsKnown && totalKnown
          ? Math.max(0, Math.min(100, Math.floor((primaryValue / totalKnown) * 100)))
          : null;

      let shouldLog = !state.logged;
      if (!shouldLog) {
        if (percentVal != null && percentVal !== state.lastPercent) {
          shouldLog = true;
        } else if (!totalIsKnown && shouldLogUnknownDelta(primaryValue, state.lastValue)) {
          shouldLog = true;
        }
      }

      if (!shouldLog) return;

      const payload = {
        stage: stageName,
        status: statusText || stageName,
        total: totalDisplay,
        totalKnown: totalIsKnown,
        percent:
          totalIsKnown && percentVal != null ? `${percentVal}%` : "-",
      };
      if (primaryLabel) payload[primaryLabel] = primaryValue;

      addInfo(`[Progress] ${JSON.stringify(payload)}`, contexto);
      progressLogState.set(stageName, {
        lastPercent: percentVal,
        lastValue: primaryValue,
        logged: true,
      });
    }

    let validator;
    try {
      const overlap = PIPELINE_FAST_PATH
        ? await existsAnyDataInRange(metadados)
        : await existsAnyCsvDateInTable(metadados); // true/false/null
      if (overlap === null) {
        // Sem coluna_data → segue sua regra original
        validator = "cadastro";
      } else {
        validator = overlap ? "substituir" : "inserir";
      }
    } catch (e) {
      addErro(`Erro ao validar datas no banco: ${e.message}`, contexto);
      throw e;
    }

    if (validator === "cadastro" || validator === "substituir") {
      try {
        void logActivity("info", "Removendo período anterior", { filePath: contexto });
        await deleteFromTable(metadados);
        const msg = validator === "cadastro"
          ? "[Delete dados] tabela limpa para reinserção cadastral"
          : "[Gerenciamento] substituição: período removido antes da reinserção";
        addInfo(msg, contexto);
        void logActivity("info", "Remoção concluída", { filePath: contexto });
      } catch (e) {
        addErro(`Erro ao deletar antes da reinserção: ${e.message}`, contexto);
        void logActivity("error", `Falha ao deletar período: ${e.message}`, { filePath: contexto });
        throw e;
      }
    } else if (validator === null) {
      addErro("Validação nula (dados inválidos ou sem coluna de data).", contexto);
      void logActivity("warn", "Validação nula: dados inválidos", { filePath: contexto });
      return {
        erro: true,
        total: totalForReturn,
        inseridos: 0,
        falhas: totalForReturn,
        mensagem: "Validação nula",
      };
    }

    addInfo("Iniciando leitura e montagem de lotes...", contexto);
    void logActivity("info", "Pipeline de streaming iniciado", { filePath: contexto });
    updateActiveJob(contexto, { stage: "leitura", detail: "Stream iniciada", progress: lastPctAbs / 100 });

    try {
      const resultado = await streamPipeline(
        metadados,
        tiposFinal,
        {
          publishRead: (lidas) => {
            const status = totalIsKnown
              ? `Montando lote (${lidas}/${totalDisplay})`
              : `Montando lote (${lidas}/-)`;
            publish(totalIsKnown && totalKnown ? lidas / totalKnown : 0, status);
            logProgress(currentStageName, status, "linhasLidas", lidas);
          },
          publishInsert: (inseridos) => {
            const status = totalIsKnown
              ? `Inseridos: ${inseridos}/${totalDisplay}`
              : `Inseridos: ${inseridos}/-`;
            publish(
              totalIsKnown && totalKnown ? inseridos / totalKnown : 0,
              status
            );
            logProgress(currentStageName, status, "inseridos", inseridos);
          },
          onInsertStart: () => setPhase("insert"),
          onFlush: () => atualizarBarra(barraId, 0, "Enviando lote..."),
        },
        { logData }
      );

      const updatedTotal = normalizeTotal(metadados.total_linhas);
      if (updatedTotal != null) {
        totalKnown = updatedTotal;
        totalIsKnown = true;
        totalDisplay = String(updatedTotal);
        totalForReturn = updatedTotal;
        const finalInseridos = Number.isFinite(resultado?.inseridos)
          ? resultado.inseridos
          : updatedTotal;
        const finalStatus = `Inseridos: ${finalInseridos}/${totalDisplay}`;
        logProgress(currentStageName, finalStatus, "inseridos", finalInseridos);
      }

      // finaliza em 100%
      if (lastPctAbs < 100) {
        atualizarBarra(barraId, 100 - lastPctAbs, "Concluído");
        lastPctAbs = 100;
      }

      addInfo("Processo de inserção finalizado.", contexto);
      void logActivity("info", "Pipeline de streaming concluído", { filePath: contexto });
      updateActiveJob(contexto, { stage: "finalização", progress: 1, detail: "Processo concluído" });

      return resultado;
    } catch (e) {
      addErro(`Falha no pipeline de leitura/inserção: ${e.message}`, contexto);
      void logActivity("error", `Falha no pipeline: ${e.message}`, { filePath: contexto });
      throw e;
    }
  } finally {
    await finalizarBarra(barraId);
  }
}


export async function managerDeleterController(logData) {
  const contexto = logData.caminho_original;

  try {
    void logActivity("info", "Fluxo de deleção iniciado", { filePath: contexto });
    const res = await deleteFromTable(logData);
    const removidos = res?.affectedRows ?? res?.affected_rows ?? 0;
    addInfo( `[DELETE] Removidos ${removidos} registros de ${logData.tabela || logData.tabela_destino}.`, contexto );
    void logActivity("info", `Fluxo de deleção concluído (${removidos} registros)`, { filePath: contexto });
    return { erro: false, removidos };
  } catch (e) {
    addErro( `Erro ao deletar período no banco pós exclusão do arquivo, erro: ${e.message}`, contexto);
    void logActivity("error", `Erro durante deleção: ${e.message}`, { filePath: contexto });
    return { erro: true, mensagem: e.message };
  }
}
