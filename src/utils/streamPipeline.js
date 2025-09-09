import pLimit from "p-limit";
import { streamCsvRows } from "./csvStream.js";
import sanitizeRow from "./sanitizeValue.js";
import { insertBatchInTable, insertRegisterinTable } from "../model/tableModel.js";
import { addAviso, addErro, addInfo } from "../middleware/errorHandler.js";
import {
  BATCH_SIZE,
  MAX_CONCURRENT_INSERTS,
  QUEUE_HIGH_WATERMARK,
  QUEUE_LOW_WATERMARK,
} from "./config.js";

/**
 * Executa a ingestão de um CSV em modo streaming.
 * @param {object} metadados Informações do CSV e da tabela de destino.
 * @param {object} tiposFinal Tipos normalizados das colunas.
 * @param {object} opts Callbacks de progresso.
 */
export async function streamPipeline(metadados, tiposFinal, opts = {}) {
  console.log("[DEBUG] streamPipeline chamado")
  const {
    publishRead,
    publishInsert,
    onInsertStart,
    onFlush,
  } = opts;

  const {
    caminho_original: contexto,
    tabela,
    colunas_json: headersNorm,
    colunas_tabela: cols,
    encoding,
    delimiter,
    total_linhas: total,
  } = metadados;

  const BATCH_ROWS_CAP = BATCH_SIZE;
  const MAX_BATCH_BYTES = 48 * 1024 * 1024;
  const HWM = 1024 * 1024;

  const order = cols.map((c) => c.name || c);

  function approxRowBytes(row) {
    let bytes = 2; // "(" ")"
    for (let i = 0; i < order.length; i++) {
      const v = row[order[i]];
      if (v == null) {
        bytes += 4; // NULL
      } else if (typeof v === "number") {
        bytes += 24; // número em texto
      } else {
        const s = String(v);
        bytes += 2 + Buffer.byteLength(s, "utf8") + Math.ceil(s.length * 0.1);
      }
      bytes += 1; // vírgula
    }
    return bytes + 1;
  }

  const limit = pLimit(MAX_CONCURRENT_INSERTS);
  const inflight = new Set();

  let batch = [];
  let batchBytes = 0;
  let lidas = 0;
  let inseridosAteAgora = 0;
  let insertPhaseStarted = false;

  async function doInsert(lote) {
    if (!insertPhaseStarted) {
      onInsertStart?.();
      insertPhaseStarted = true;
    }
    try {
      await insertBatchInTable(tabela, lote, cols, { skipUpdateClause: true });
      inseridosAteAgora += lote.length;
      publishInsert?.(inseridosAteAgora, total);
    } catch (e) {
      addAviso(
        `[BATCH] Falha no lote (${lote.length}). Fallback linha-a-linha. Motivo: ${e.message}`,
        contexto,
      );
      let ok = 0, fail = 0;
      for (const row of lote) {
        try {
          await insertRegisterinTable(tabela, row, cols);
          ok++; inseridosAteAgora++;
        } catch (err) {
          fail++; addErro(`Erro ao inserir linha ${inseridosAteAgora + 1}: ${err.message}`, contexto);
        }
      }
      publishInsert?.(inseridosAteAgora, total);
    } finally {
      addInfo(`[BATCH] Inseridos ${lote.length} linhas (até agora: ${inseridosAteAgora}/${total}).`, contexto);
    }
  }

  async function flushBatch() {
    if (batch.length === 0) return;
    const lote = batch;
    batch = [];
    batchBytes = 0;
    onFlush?.(lote.length);
    const p = limit(() => doInsert(lote));
    inflight.add(p);
    p.finally(() => inflight.delete(p));
  }

  for await (const linhaOriginal of streamCsvRows(
    contexto,
    headersNorm,
    encoding,
    delimiter,
    { highWaterMark: HWM },
  )) {
    const linhaTipada = sanitizeRow(linhaOriginal, tiposFinal, contexto);
    const rowBytes = approxRowBytes(linhaTipada);

    if (batch.length > 0 && (batch.length >= BATCH_ROWS_CAP || (batchBytes + rowBytes) > MAX_BATCH_BYTES)) {
      await flushBatch();
      while (inflight.size >= QUEUE_HIGH_WATERMARK) {
        await Promise.race(inflight);
      }
      while (inflight.size > QUEUE_LOW_WATERMARK) {
        await Promise.race(inflight);
      }
    }

    batch.push(linhaTipada);
    batchBytes += rowBytes;
    lidas++;
    publishRead?.(lidas, total, batch.length);
  }

  await flushBatch();
  await Promise.all(inflight);

  return {
    erro: false,
    total,
    inseridos: inseridosAteAgora,
    falhas: Math.max(0, total - inseridosAteAgora),
    mensagem: null,
  };
}

export default streamPipeline;
