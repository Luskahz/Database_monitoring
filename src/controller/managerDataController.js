import { deleteFromTable, existsAnyDataInRange, existsAnyCsvDateInTable } from "../model/tableModel.js";
import {
  iniciarBarra,
  atualizarBarra,
  finalizarBarra,
} from "../utils/progressBar.js";

import { addAviso, addErro, addInfo } from "../middleware/errorHandler.js";
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

export async function manageInsertController(metadados, logData) {
  const contexto = metadados.caminho_original;
  const nomeArquivo = metadados.nome_arquivo ?? "arquivo-desconhecido";
  const barraId = `${nomeArquivo}::${metadados.ano ?? "-"}::${metadados.tabela}`;

  console.log(`[DB] Using pool limit=${POOL_MAX} | insert_concurrency=${INSERT_MAX_CONCURRENT} | files_concurrency=${FILES_MAX_CONCURRENT}`);
  addInfo(
    `Configuração: INSERT_MAX_CONCURRENT=${INSERT_MAX_CONCURRENT}, FILES_MAX_CONCURRENT=${FILES_MAX_CONCURRENT}, BATCH_SIZE=${BATCH_SIZE}, QUEUE_HIGH_WATERMARK=${HIGH_WATERMARK_DEFAULT}, QUEUE_LOW_WATERMARK=${LOW_WATERMARK_DEFAULT}`,
    contexto,
  );

  // -------- Barra global: 0..100 (3 fases) --------
  const PHASES = { prep: 15, read: 45, insert: 40 }; // soma 100
  let phaseBase = 0;
  let phaseSpan = PHASES.prep;
  let lastPctAbs = 0;

  iniciarBarra(barraId, 100, nomeArquivo, metadados.tabela, metadados.ano);

  function setPhase(name) {
    phaseBase += phaseSpan;
    phaseSpan = PHASES[name];
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

    // Tipos esperados (schema + overrides)
    const schemaMap = await loadDecimalProfilesFromSchema(metadados.tabela);
    const tiposFinal = expandTiposWithSchema(metadados.tipos_esperados, schemaMap);

    publish(1.0, "Preparação concluída");
    setPhase("read"); // 15..60%

    // -------- Valida dados e ação --------
    const total = metadados.total_linhas || 0;

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
        await deleteFromTable(metadados);
        const msg = validator === "cadastro"
          ? "[Delete dados] tabela limpa para reinserção cadastral"
          : "[Gerenciamento] substituição: período removido antes da reinserção";
        addInfo(msg, contexto);
      } catch (e) {
        addErro(`Erro ao deletar antes da reinserção: ${e.message}`, contexto);
        throw e;
      }
    } else if (validator === null) {
      addErro("Validação nula (dados inválidos ou sem coluna de data).", contexto);
      return { erro: true, total, inseridos: 0, falhas: total, mensagem: "Validação nula" };
    }

    addInfo("Iniciando leitura e montagem de lotes...", contexto);

    try {
      const resultado = await streamPipeline(
        metadados,
        tiposFinal,
        {
          publishRead: (lidas) => publish(total ? lidas / total : 0, "Montando lote..."),
          publishInsert: (inseridos) =>
            publish(total ? inseridos / total : 0, `Inseridos: ${inseridos}/${total}`),
          onInsertStart: () => setPhase("insert"),
          onFlush: () => atualizarBarra(barraId, 0, "Enviando lote..."),
        },
        { logData }
      );

      // finaliza em 100%
      if (lastPctAbs < 100) {
        atualizarBarra(barraId, 100 - lastPctAbs, "Concluído");
        lastPctAbs = 100;
      }

      addInfo("Processo de inserção finalizado.", contexto);

      return resultado;
    } catch (e) {
      addErro(`Falha no pipeline de leitura/inserção: ${e.message}`, contexto);
      throw e;
    }
  } finally {
    await finalizarBarra(barraId);
  }
}


export async function managerDeleterController(logData) {
  const contexto = logData.caminho_original;

  try {
    const res = await deleteFromTable(logData);
    const removidos = res?.affectedRows ?? res?.affected_rows ?? 0;
    addInfo( `[DELETE] Removidos ${removidos} registros de ${logData.tabela || logData.tabela_destino}.`, contexto );
    return { erro: false, removidos };
  } catch (e) {
    addErro( `Erro ao deletar período no banco pós exclusão do arquivo, erro: ${e.message}`, contexto);
    return { erro: true, mensagem: e.message };
  }
}
