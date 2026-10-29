import path from "path";
import { deleteFromTable, buildRangeFromMetadados } from "../model/tableModel.js";
import { atualizarBarra } from "../utils/progressBar.js";

import { addAviso, addErro, addInfo } from "../middleware/errorHandler.js";
import { logActivity, writeStatusUpdate } from "../middleware/logger.js";
import { decideOverlapPolicy } from "../utils/decideOverlapPolicy.js";
import streamPipeline, {
  POOL_MAX,
  INSERT_MAX_CONCURRENT,
} from "../utils/streamPipeline.js";
import { FILES_MAX_CONCURRENT } from "../../config/index.js";
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

// ⏱️ PERF
import { startPerf, endPerf, perfWrap } from "../utils/perfLogger.js";

function buildContextTag(metadados) {
  if (!metadados) return "";
  const tabela = metadados.tabela || metadados?.destino?.tabela_destino || "tabela-desconhecida";
  const ano = metadados.ano ?? metadados?.destino?.ano ?? metadados?.range?.ano ?? "—";
  return `[${tabela}][${ano}]`;
}

function buildLogAction(metadados) {
  if (!metadados) return undefined;
  const tabela = metadados.tabela || metadados?.destino?.tabela_destino;
  const ano = metadados.ano ?? metadados?.destino?.ano ?? metadados?.range?.ano;
  return [tabela, ano].filter((value) => value != null && value !== "").join(" ");
}

export async function manageInsertController(metadados, logData) {
  const contexto = metadados.caminho_original;
  const workPath = metadados.paths?.work || contexto;
  const nomeArquivo = metadados.nome_arquivo ?? "arquivo-desconhecido";
  const barraId = `${nomeArquivo}::${metadados.ano ?? "-"}::${metadados.tabela}`;
  const contextTag = buildContextTag(metadados);
  const activityAction = buildLogAction(metadados);
  const withTag = (msg) => (contextTag ? `${contextTag} ${msg}` : msg);
  const info = (msg) => addInfo(withTag(msg), contexto);
  const erro = (msg) => addErro(withTag(msg), contexto);
  const aviso = (msg) => addAviso(withTag(msg), contexto);
  const activity = (level, message) =>
    logActivity(level, message, { filePath: contexto, action: activityAction });

  // ⏱️ contexto para logs de perf
  const perfCtx = `${nomeArquivo}|${metadados?.tabela || "-"}`;

  startPerf("insert.manageInsertController", perfCtx);

  info(`[DB] Using pool limit=${POOL_MAX} | insert_concurrency=${INSERT_MAX_CONCURRENT} | files_concurrency=${FILES_MAX_CONCURRENT}`);
  info(
    `Configuração: INSERT_MAX_CONCURRENT=${INSERT_MAX_CONCURRENT}, FILES_MAX_CONCURRENT=${FILES_MAX_CONCURRENT}, BATCH_SIZE=${BATCH_SIZE}, QUEUE_HIGH_WATERMARK=${HIGH_WATERMARK_DEFAULT}, QUEUE_LOW_WATERMARK=${LOW_WATERMARK_DEFAULT}`,
  );
  void activity("info", "Preparação iniciada");
  updateActiveJob(contexto, { stage: "preparação", detail: "Coletando metadados" });

  // -------- Barra global: 0..100 (3 fases) --------
  const PHASES = { prep: 15, read: 45, insert: 40 }; // soma 100
  let phaseBase = 0;
  let phaseSpan = PHASES.prep;
  let lastPctAbs = 0;
  const stageNames = { prep: "preparação", read: "leitura", insert: "inserção" };
  let currentStageName = stageNames.prep;

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

    // ⏱️ Detect encoding
    if (!encoding) {
      const encRes = await perfWrap("prep.detectEncoding", perfCtx, () =>
        detectEncoding({ filePath: workPath })
      );
      encoding = encRes?.encoding;
    } else {
      startPerf("prep.detectEncoding", perfCtx);
      endPerf("prep.detectEncoding", perfCtx, { skipped: true, encoding });
    }
    publish(0.1, encoding ? `Encoding: ${encoding}` : "Detectando encoding...");

    // ⏱️ Detect delimiter
    if (!delimiter) {
      delimiter = await perfWrap("prep.detectDelimiter", perfCtx, () =>
        detectDelimiter(workPath, encoding)
      );
    } else {
      startPerf("prep.detectDelimiter", perfCtx);
      endPerf("prep.detectDelimiter", perfCtx, { skipped: true, delimiter });
    }
    publish(
      0.4,
      `Encoding: ${encoding} | Delimitador: ${delimiter}`
    );

    metadados.encoding = encoding;
    metadados.delimiter = delimiter;
    const headersNorm = metadados.colunas_json;
    updateActiveJob(contexto, { detail: `Encoding ${encoding} | Delimitador ${delimiter}` });

    // ⏱️ Tipos esperados (schema + overrides)
    const schemaMap = await perfWrap("prep.loadDecimalProfilesFromSchema", perfCtx, () =>
      loadDecimalProfilesFromSchema(metadados.tabela)
    );
    const tiposFinal = await perfWrap("prep.expandTiposWithSchema", perfCtx, () =>
      expandTiposWithSchema(metadados.tipos_esperados, schemaMap)
    );

    void activity("info", "Preparação concluída");
    publish(1.0, "Preparação concluída");

    // -------- Fase 2: leitura/validação --------
    setPhase("read");
    void activity("info", "Leitura e validação iniciadas");

    // ⏱️ Overlap decision
    const overlapDecision = await perfWrap("policy.ensureOverlapDecision", perfCtx, () =>
      ensureOverlapDecision(metadados, contexto)
    );

    const strategy = overlapDecision?.strategy || "insert";
    const hasOverlap = overlapDecision?.hasOverlap === true;
    metadados.applyPreDelete = strategy === "replace";

    logManageStrategy(
      contexto,
      {
        usingStrategy: strategy,
        hasOverlap,
        reason: overlapDecision?.reason ?? null,
        range: metadados.range ?? null,
        applyPreDelete: metadados.applyPreDelete,
      },
      activityAction,
      contextTag
    );

    const validator = strategy === "replace"
      ? metadados.coluna_data ? "substituir" : "cadastro"
      : "inserir";

    // ⏱️ Pre-delete quando necessário
    if (validator === "cadastro" || validator === "substituir") {
      await perfWrap("policy.predelete.deleteFromTable", perfCtx, async () => {
        try {
          void activity("info", "Removendo período anterior");
          await deleteFromTable(metadados);
          const msg = validator === "cadastro"
            ? "[Delete dados] tabela limpa para reinserção cadastral"
            : "[Gerenciamento] substituição: período removido antes da reinserção";
          info(msg);
          void activity("info", "Remoção concluída");
        } catch (e) {
          erro(`Erro ao deletar antes da reinserção: ${e.message}`);
          void activity("error", `Falha ao deletar período: ${e.message}`);
          throw e;
        }
      });
    }

    info("Iniciando leitura e montagem de lotes...");
    void activity("info", "Pipeline de streaming iniciado");
    updateActiveJob(contexto, { stage: "leitura", detail: "Stream iniciada", progress: lastPctAbs / 100 });

    // -------- Fase 3: pipeline (leitura + inserção) --------
    let resultado;
    try {
      resultado = await perfWrap("pipeline.streamPipeline", perfCtx, () =>
        streamPipeline(
          metadados,
          tiposFinal,
          {
            publishRead: (lidas) => {
              const totalKnown = normalizeTotal(metadados.total_linhas);
              const totalIsKnown = totalKnown != null;
              const totalDisplay = totalIsKnown ? String(totalKnown) : "-";
              const status = totalIsKnown
                ? `Montando lote (${lidas}/${totalDisplay})`
                : `Montando lote (${lidas}/-)`;
              publish(totalIsKnown && totalKnown ? lidas / totalKnown : 0, status);
            },
            publishInsert: (inseridos) => {
              const totalKnown = normalizeTotal(metadados.total_linhas);
              const totalIsKnown = totalKnown != null;
              const totalDisplay = totalIsKnown ? String(totalKnown) : "-";
              const status = totalIsKnown
                ? `Inseridos: ${inseridos}/${totalDisplay}`
                : `Inseridos: ${inseridos}/-`;
              publish(totalIsKnown && totalKnown ? inseridos / totalKnown : 0, status);
            },
            onInsertStart: () => setPhase("insert"),
            onFlush: () => atualizarBarra(barraId, 0, "Enviando lote..."),
          },
          { logData }
        )
      );

      // Ajuste do total (se conhecido após ler cabeçalho/contagem)
      const updatedTotal = normalizeTotal(metadados.total_linhas);
      if (updatedTotal != null) {
        const finalInseridos = Number.isFinite(resultado?.inseridos)
          ? resultado.inseridos
          : updatedTotal;
        const finalStatus = `Inseridos: ${finalInseridos}/${String(updatedTotal)}`;
        publish(1, finalStatus);
      }

      // finaliza em 100%
      if (lastPctAbs < 100) {
        atualizarBarra(barraId, 100 - lastPctAbs, "Concluído");
        lastPctAbs = 100;
      }

      info("Processo de inserção finalizado.");

      // ⏱️ writeStatusUpdate
      await perfWrap("logger.writeStatusUpdate", perfCtx, async () => {
        try {
          const arquivo = path.basename(contexto || "");
          const tabelaFin =
            metadados?.destino?.tabela_destino || metadados?.tabela || "—";
          const overlapStrategy =
            metadados?.overlap?.strategy || metadados?.manage?.usingStrategy;

          const range = metadados?.range || metadados?.manage?.range;
          const dataStr = (() => {
            if (!range?.start) return "—";
            const d = new Date(range.start);
            const y = d.getFullYear();
            const mes = new Intl.DateTimeFormat("pt-BR", {
              month: "long",
              timeZone: "America/Sao_Paulo",
            })
              .format(d)
              .toLowerCase();
            return `${y}-${mes}-—`;
          })();

          const acao =
            metadados?.arquivoAlterado || overlapStrategy === "replace"
              ? "modified"
              : "insert";

          await writeStatusUpdate({
            filePath: contexto,
            arquivo,
            tabela: tabelaFin,
            dataStr,
            acao,
            hash: metadados?.hash || "—",
          });
        } catch (err) {
          aviso(`[Status] não foi possível registrar atualização: ${err?.message || err}`);
        }
      });

      void activity("info", "Pipeline de streaming concluído");
      updateActiveJob(contexto, { stage: "finalização", progress: 1, detail: "Processo concluído" });

      return resultado;
    } catch (e) {
      erro(`Falha no pipeline de leitura/inserção: ${e.message}`);
      void activity("error", `Falha no pipeline: ${e.message}`);
      throw e;  
    }
  }
  finally {
    // Se precisar garantir algo aqui (ex: atualizar status de job)
    updateActiveJob(contexto, { stage: "finalização", detail: "Encerrado com erro ou sucesso" });
    endPerf("insert.manageInsertController", perfCtx, {
      tabela: metadados?.tabela,
      total: metadados?.total_linhas ?? null
    });
  }
}

async function ensureOverlapDecision(metadados, contexto) {

  const perfCtx = `${metadados?.nome_arquivo ?? path.basename(contexto || "")}|${metadados?.tabela || "-"}`;
  startPerf("policy.ensureOverlapDecision(inner)", perfCtx);

  try {
    if (!metadados) return null;
    if (metadados.overlap) {
      if (!metadados.range) {
        metadados.range = buildRangeFromMetadados(metadados);
      }
      return metadados.overlap;
    }

    const contextTag = buildContextTag(metadados);
    addAviso(
      contextTag
        ? `${contextTag} [OverlapDecision] Metadados sem decisão prévia; calculando tardiamente (manager).`
        : "[OverlapDecision] Metadados sem decisão prévia; calculando tardiamente (manager).",
      contexto
    );
    const range = metadados.range ?? buildRangeFromMetadados(metadados);
    metadados.range = range || null;

    const decision = await perfWrap("policy.decideOverlapPolicy", perfCtx, () =>
      decideOverlapPolicy({
        table: metadados.tabela,
        dateCol: metadados.coluna_data,
        range,
        logger: createOverlapLogger(
          contexto,
          metadados.acao,
          buildLogAction(metadados),
          contextTag
        ),
      })
    );

    metadados.overlap = decision;
    return decision;
  } finally {
    endPerf("policy.ensureOverlapDecision(inner)", perfCtx);
  }
}

function createOverlapLogger(contexto, action, activityAction, contextTag = "") {
  return {
    info(message, payload = {}) {
      try {
        const serialized = JSON.stringify(payload);
        const line = `${message} ${serialized}`;
        addInfo(contextTag ? `${contextTag} ${line}` : line, contexto);
        void logActivity("info", line, { filePath: contexto, action: activityAction || action });
      } catch (err) {
        const fallback = `${message} ${payload ? String(payload) : ""}`;
        addInfo(contextTag ? `${contextTag} ${fallback}` : fallback, contexto);
        void logActivity("info", message, { filePath: contexto, action: activityAction || action });
      }
    },
  };
}

function logManageStrategy(contexto, payload, activityAction, contextTag = "") {
  try {
    const line = `[ManageInsert] ${JSON.stringify(payload)}`;
    addInfo(contextTag ? `${contextTag} ${line}` : line, contexto);
    void logActivity("info", line, { filePath: contexto, action: activityAction });
  } catch (err) {
    const fallbackLine = contextTag ? `${contextTag} [ManageInsert]` : "[ManageInsert]";
    addInfo(fallbackLine, contexto);
    void logActivity("info", "[ManageInsert]", { filePath: contexto, action: activityAction });
  }
}

export async function managerDeleterController(logData) {
  const perfCtx = `${logData?.nome_arquivo ?? path.basename(logData?.caminho || logData?.caminho_original || "")}|${logData?.tabela || "-"}`;
  startPerf("delete.managerDeleterController", perfCtx);

  const contexto = logData?.caminho_original ?? logData?.caminho ?? "(sem-caminho)";
  const contextTag = buildContextTag(logData);
  const activityAction = buildLogAction(logData);
  const withTag = (msg) => (contextTag ? `${contextTag} ${msg}` : msg);

  try {
    void logActivity("info", "Fluxo de deleção iniciado", { filePath: contexto, action: activityAction });

    const res = await perfWrap("delete.deleteFromTable", perfCtx, () =>
      deleteFromTable(logData)
    );

    const removidos = res?.affectedRows ?? res?.affected_rows ?? 0;
    addInfo(withTag(`[DELETE] Removidos ${removidos} registros de ${logData.tabela || logData.tabela_destino}.`), contexto);

    void logActivity("info", `Fluxo de deleção concluído (${removidos} registros)`, {
      filePath: contexto,
      action: activityAction,
    });

    return { erro: false, removidos };
  } catch (e) {
    addErro(withTag(`Erro ao deletar período no banco pós exclusão do arquivo, erro: ${e.message}`), contexto);
    void logActivity("error", `Erro durante deleção: ${e.message}`, { filePath: contexto, action: activityAction });
    return { erro: true, mensagem: e.message };
  } finally {
    endPerf("delete.managerDeleterController", perfCtx);
  }
}

