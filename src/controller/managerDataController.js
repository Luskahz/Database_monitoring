import {
  insertRegisterinTable,
  insertBatchInTable,
  listPeriodInTable,
  deleteFromTable,
} from "../model/tableModel.js";
import {
  iniciarBarra,
  atualizarBarra,
  finalizarBarra,
} from "../utils/progressBar.js";

import { insertValidator } from "./insertValidator.js";
import { addAviso, addErro, addInfo } from "../middleware/errorHandler.js";
import { updateLoggerController } from "../middleware/logger.js";
import { streamCsvRows } from "../utils/csvStream.js";
import {
  detectDelimiter,
  detectEncoding,
} from "../utils/prepareStreamByFilepath.js";
import sanitizeRow from "../utils/sanitizeValue.js";
import {
  loadDecimalProfilesFromSchema,
  expandTiposWithSchema,
} from "../model/tableModel.js";

export async function manageInsertController(metadados) {
  const contexto = metadados.caminho_original;
  const nomeArquivo = metadados.nome_arquivo ?? "arquivo-desconhecido";
  const barraId = `${nomeArquivo}::${metadados.ano ?? "-"}::${
    metadados.tabela
  }`;

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
    const abs = Math.max(
      0,
      Math.min(100, Math.floor(phaseBase + percent0to1 * phaseSpan))
    );
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
    publish(0.1, "Detectando encoding...");
    let { encoding } = metadados;
    if (!encoding) {
      const det = await detectEncoding(contexto);
      encoding = det.encoding;
    }

    publish(0.4, `Encoding: ${encoding} | Detectando delimitador...`);
    let { delimiter } = metadados;
    if (!delimiter) {
      delimiter = await detectDelimiter(contexto, encoding);
    }

    publish(0.8, `Delimitador: ${delimiter}`);
    const headersNorm = metadados.colunas_json;

    // Tipos esperados (schema + overrides)
    const schemaMap = await loadDecimalProfilesFromSchema(metadados.tabela);
    const tiposFinal = expandTiposWithSchema(
      metadados.tipos_esperados,
      schemaMap
    );

    publish(1.0, "Preparação concluída");
    setPhase("read"); // 15..60%

    // -------- Valida dados e ação --------
    const total = metadados.total_linhas || 0;
    if (total === 0) {
      addAviso("Nenhuma linha disponível para inserção.", contexto);
      publish(1.0, "Nada a fazer");
      setPhase("insert");
      publish(1.0, "Sem inserções necessárias");
      return {
        erro: false,
        total: 0,
        inseridos: 0,
        falhas: 0,
        mensagem: "Arquivo vazio",
      };
    }

    let listFromTable;
    try {
      listFromTable = await listPeriodInTable(metadados);
    } catch (e) {
      addErro(`Erro ao consultar o período no banco: ${e.message}`, contexto);
      await updateLoggerController(metadados, contexto);
      throw e;
    }

    const validator = await insertValidator(listFromTable, metadados);

    if (validator === "cadastro" || validator === "substituir") {
      try {
        await deleteFromTable(metadados);
        const msg =
          validator === "cadastro"
            ? "[Delete dados] tabela limpa para reinserção cadastral"
            : "[Gerenciamento] substituição: período removido antes da reinserção";
        addInfo(msg, contexto);
      } catch (e) {
        addErro(`Erro ao deletar antes da reinserção: ${e.message}`, contexto);
        await updateLoggerController(metadados, contexto);
        throw e;
      }
    } else if (validator === null) {
      addErro(
        "Validação nula (dados inválidos ou sem coluna de data).",
        contexto
      );
      await updateLoggerController(metadados, contexto);
      return {
        erro: true,
        total,
        inseridos: 0,
        falhas: total,
        mensagem: "Validação nula",
      };
    }

    addInfo("Iniciando leitura e montagem de lotes...", contexto);

    // -------- Fase 2 (read): leitura/sanitização + enfileirar --------
    const BATCH_SIZE = 10_000;
    let batch = [];
    let lidas = 0;
    let inseridosAteAgora = 0;
    const cols = metadados.colunas_tabela;

    // para reportar progresso na fase insert
    function publishInsertStatus(texto) {
      const p = Math.min(1, inseridosAteAgora / total);
      publish(p, texto);
    }

    let insertPhaseStarted = false;

    async function flushBatch() {
      if (batch.length === 0) return;

      atualizarBarra(
        barraId,
        0,
        `Inserindo ${batch.length} registros no banco...`
      );
      if (!insertPhaseStarted) {
        setPhase("insert"); // 60..100%
        insertPhaseStarted = true;
      }

      const lote = batch;
      batch = []; // limpa antes do await

      publishInsertStatus(`Enviando lote de ${lote.length} registros...`);

      try {
        await insertBatchInTable(metadados.tabela, lote, cols);
        inseridosAteAgora += lote.length;
        publishInsertStatus(`Inseridos: ${inseridosAteAgora}/${total}`);
      } catch (e) {
        addAviso(
          `[BATCH] Falha no lote (${lote.length}). Fallback linha-a-linha. Motivo: ${e.message}`,
          contexto
        );
        await updateLoggerController(metadados, contexto);

        let ok = 0,
          fail = 0;
        for (const row of lote) {
          try {
            await insertRegisterinTable(metadados.tabela, row, cols);
            ok++;
            inseridosAteAgora++;
          } catch (err) {
            fail++;
            addErro(
              `Erro ao inserir linha ${inseridosAteAgora + 1}: ${err.message}`,
              contexto
            );
          } finally {
            publishInsertStatus(`Fallback: ok=${ok}, fail=${fail}`);
          }
        }
      }
    }

    try {
      let currentBatchCount = 0;

      for await (const linhaOriginal of streamCsvRows(
        contexto,
        headersNorm,
        encoding,
        delimiter
      )) {
        const linhaTipada = sanitizeRow(linhaOriginal, tiposFinal, contexto);

        // guarda a linha tipada "crua"
        batch.push(linhaTipada);
        currentBatchCount++;
        lidas++;

        // avança a fase read (15..60%) com base em lidas/total
        publish(
          lidas / total,
          `Montando lote (${currentBatchCount}/${BATCH_SIZE})`
        );

        if (batch.length >= BATCH_SIZE) {
          atualizarBarra(
            barraId,
            0,
            `Enviando lote de ${BATCH_SIZE} registros...`
          );
          await flushBatch();
          currentBatchCount = 0;
        }
      }

      // resto do último lote
      await flushBatch();

      // se não houve insert (p.ex. leitura sem linhas úteis)
      if (!insertPhaseStarted) {
        publish(1.0, "Leitura & sanitização concluídas");
        setPhase("insert");
        publish(1.0, "Sem inserções necessárias");
      }

      // finaliza em 100%
      if (lastPctAbs < 100) {
        atualizarBarra(barraId, 100 - lastPctAbs, "Concluído");
        lastPctAbs = 100;
      }

      addInfo("Processo de inserção finalizado.", contexto);

      return {
        erro: false,
        total,
        inseridos: inseridosAteAgora,
        falhas: Math.max(0, total - inseridosAteAgora),
        mensagem: null,
      };
    } catch (e) {
      addErro(`Falha no pipeline de leitura/inserção: ${e.message}`, contexto);
      await updateLoggerController(metadados, contexto);
      throw e;
    }
  } finally {
    await finalizarBarra(barraId);
  }
}

export async function managerDeleterController(logData) {
  const contexto = logData.caminho_original;
  try {
    await deleteFromTable(logData);
    return { erro: false };
  } catch (e) {
    addErro(
      `Erro ao deletar período no banco pós exclusão do arquivo, erro: ${e.message}`,
      contexto
    );
    await updateLoggerController(logData, contexto);
    return { erro: true, mensagem: e.message };
  }
}
