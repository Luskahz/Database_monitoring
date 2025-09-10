import pLimit from "p-limit";
import Papa from "papaparse";
import iconv from "iconv-lite";
import crypto from "crypto";
import { createFileTee } from "./csvStream.js";
import sanitizeRow from "./sanitizeValue.js";
import { insertBatchInTable, insertRegisterinTable } from "../model/tableModel.js";
import { addAviso, addErro, addInfo } from "../middleware/errorHandler.js";
import {
  BATCH_SIZE,
  INSERT_CONCURRENCY,
  BATCH_QUEUE_HIGH_WATERMARK,
  BATCH_QUEUE_LOW_WATERMARK,
} from "../config/index.js";

/**
 * Executa a ingestão de um CSV em modo streaming.
 * @param {object} metadados Informações do CSV e da tabela de destino.
 * @param {object} tiposFinal Tipos normalizados das colunas.
 * @param {object} opts Callbacks de progresso.
 */
export async function streamPipeline(metadados, tiposFinal, opts = {}, pipelineOpts = {}) {
  const { publishRead, publishInsert, onInsertStart, onFlush } = opts;
  const {
    computeHash = true,
    insertBatchFn = insertBatchInTable,
    insertRegisterFn = insertRegisterinTable,
  } = pipelineOpts;

  const {
    caminho_original: contexto,
    tabela,
    colunas_json: headersNorm,
    colunas_tabela: cols,
    encoding,
    delimiter,
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

  const limit = pLimit(INSERT_CONCURRENCY);
  const inflight = new Set();
  let maxInflight = 0;
  let totalInsertTime = 0;
  let insertCount = 0;

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
      await insertBatchFn(tabela, lote, cols, { skipUpdateClause: true });
      inseridosAteAgora += lote.length;
      publishInsert?.(inseridosAteAgora);
    } catch (e) {
      addAviso(
        `[BATCH] Falha no lote (${lote.length}). Fallback linha-a-linha. Motivo: ${e.message}`,
        contexto,
      );
      let ok = 0, fail = 0;
      for (const row of lote) {
        try {
          await insertRegisterFn(tabela, row, cols);
          ok++; inseridosAteAgora++;
        } catch (err) {
          fail++; addErro(`Erro ao inserir linha ${inseridosAteAgora + 1}: ${err.message}`, contexto);
        }
      }
      publishInsert?.(inseridosAteAgora);
    } finally {
      addInfo(`[BATCH] Inseridos ${lote.length} linhas (até agora: ${inseridosAteAgora}).`, contexto);
    }
  }

  async function flushBatch() {
    if (batch.length === 0) return;
    const lote = batch;
    const loteBytes = batchBytes;
    batch = [];
    batchBytes = 0;
    onFlush?.(lote.length);
    const start = Date.now();
    const p = limit(() => doInsert(lote));
    inflight.add(p);
    if (inflight.size > maxInflight) maxInflight = inflight.size;
    p
      .then(() => {
        totalInsertTime += Date.now() - start;
        insertCount++;
      })
      .finally(() => inflight.delete(p));
    addInfo(
      `[FLUSH] inflight_inserts=${inflight.size}, batch_len=${lote.length}, approx_bytes=${loteBytes}`,
      contexto,
    );
  }

  const { forHash, forParse } = createFileTee(contexto, { highWaterMark: HWM });
  let hash;
  if (computeHash) {
    hash = crypto.createHash("sha256");
    forHash.on("data", (chunk) => hash.update(chunk));
  } else {
    forHash.resume();
  }

  const input =
    encoding === "latin1"
      ? forParse.pipe(iconv.decodeStream("latin1"))
      : (forParse.setEncoding("utf8"), forParse);
  const parser = Papa.parse(Papa.NODE_STREAM_INPUT, {
    header: false,
    delimiter,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });
  const stream = input.pipe(parser);
  const headersLen = headersNorm.length;
  let isFirstRow = true;

  for await (const rowArray of stream) {
    const row = Array.isArray(rowArray) ? rowArray : rowArray?.data || [];
    if (isFirstRow) { isFirstRow = false; continue; }

    const obj = {};
    for (let i = 0; i < headersLen; i++) {
      const h = headersNorm[i];
      const v = row[i];
      obj[h] = v == null ? null : typeof v === "string" ? v.trim() : v;
    }

    const linhaTipada = sanitizeRow(obj, tiposFinal, contexto);
    const rowBytes = approxRowBytes(linhaTipada);

    if (batch.length > 0 && (batch.length >= BATCH_ROWS_CAP || (batchBytes + rowBytes) > MAX_BATCH_BYTES)) {
      await flushBatch();
      while (inflight.size >= BATCH_QUEUE_HIGH_WATERMARK) {
        await Promise.race(inflight);
      }
      while (inflight.size > BATCH_QUEUE_LOW_WATERMARK) {
        await Promise.race(inflight);
      }
    }

    batch.push(linhaTipada);
    batchBytes += rowBytes;
    lidas++;
    publishRead?.(lidas);
  }

  await flushBatch();
  await Promise.all(inflight);

  const avgMs = insertCount ? totalInsertTime / insertCount : 0;
  addInfo(
    `[STATS] tempo_medio_lote=${avgMs.toFixed(2)}ms, pico_inflight=${maxInflight}`,
    contexto,
  );

  metadados.total_linhas = lidas;
  if (computeHash && hash) {
    metadados.hash = hash.digest("hex");
  }

  return {
    erro: false,
    total: lidas,
    inseridos: inseridosAteAgora,
    falhas: Math.max(0, lidas - inseridosAteAgora),
    mensagem: null,
  };
}

export default streamPipeline;
