import os from "node:os";
import pLimit from "p-limit";
import Papa from "papaparse";
import iconv from "iconv-lite";
import crypto from "crypto";
import { createFileTee } from "./csvStream.js";
import sanitizeRow from "./sanitizeValue.js";
import {
  insertBatchInTable,
  insertRegisterinTable,
} from "../model/tableModel.js";
import { addAviso, addErro, addInfo } from "../middleware/errorHandler.js";
import { getPool } from "../../config/dbPool.js";
import { memoryGuard } from "./memoryGuard.js";
import {
  BATCH_SIZE,
  ADAPTIVE_RAM_GUARD,
  MAX_BATCH_BYTES_DEFAULT,
  FILES_MAX_CONCURRENT,
  MAX_BATCH_BYTES_WHEN_HIGH,
  MAX_CONCURRENT_INSERTS_DEFAULT,
  HIGH_WATERMARK_DEFAULT,
  LOW_WATERMARK_DEFAULT,
} from "../../config/index.js";
import { logActivity } from "../middleware/logger.js";
import { updateActiveJob, updateMetrics } from "./queueTracker.js";

const CPU = Math.max(1, os.cpus()?.length ?? 1);
const pool = await getPool();
export const POOL_MAX = pool.pool?.max ?? 10;

export const metrics = {
  pendingBatches: 0,
  inFlightInserts: 0,
  lastProgressTs: Date.now(),
};

export const INSERT_MAX_CONCURRENT = MAX_CONCURRENT_INSERTS_DEFAULT;
//FILES_MAX_CONCURRENT já vem do config/index.js

console.log(
  `[Inserts] concurrency=${INSERT_MAX_CONCURRENT} | files=${FILES_MAX_CONCURRENT} | pool=${POOL_MAX}`
);
updateMetrics({ filesMaxConcurrent: FILES_MAX_CONCURRENT });

/**
 * Executa a ingestão de um CSV em modo streaming.
 * @param {object} metadados Informações do CSV e da tabela de destino.
 * @param {object} tiposFinal Tipos normalizados das colunas.
 * @param {object} opts Callbacks de progresso.
 */
export async function streamPipeline(
  metadados,
  tiposFinal,
  opts = {},
  pipelineOpts = {}
) {
  const { publishRead, publishInsert, onInsertStart, onFlush } = opts;
  const {
    computeHash = true,
    insertBatchFn = insertBatchInTable,
    insertRegisterFn = insertRegisterinTable,
    logData = null,
  } = pipelineOpts;

  const {
    caminho_original: contexto,
    tabela,
    colunas_json: headersNorm,
    colunas_tabela: cols,
    encoding,
    delimiter,
  } = metadados;
  const workPath = metadados.paths?.work || contexto;

  memoryGuard.start();

  let dynamicAllowedInserts = MAX_CONCURRENT_INSERTS_DEFAULT;
  let dynamicHighWatermark = HIGH_WATERMARK_DEFAULT;
  let dynamicLowWatermark = LOW_WATERMARK_DEFAULT;
  let dynamicMaxBatchBytes = MAX_BATCH_BYTES_DEFAULT;

  const offMem = memoryGuard.onChange((state) => {
    if (state === "HIGH") {
      dynamicAllowedInserts = 1;
      dynamicLowWatermark = 0;
      dynamicHighWatermark = Math.min(dynamicHighWatermark, 1);
      dynamicMaxBatchBytes = Math.min(
        dynamicMaxBatchBytes,
        MAX_BATCH_BYTES_WHEN_HIGH
      );
      addInfo(
        "[RAM] HIGH: reduzindo concorrência para 1, HIGH_WATERMARK=1, maxBatchBytes=" +
          dynamicMaxBatchBytes,
        contexto
      );
    } else {
      dynamicAllowedInserts = MAX_CONCURRENT_INSERTS_DEFAULT;
      dynamicHighWatermark = HIGH_WATERMARK_DEFAULT;
      dynamicLowWatermark = LOW_WATERMARK_DEFAULT;
      dynamicMaxBatchBytes = MAX_BATCH_BYTES_DEFAULT;
      addInfo(
        "[RAM] NORMAL: restaurando concorrência=" +
          dynamicAllowedInserts +
          ", HIGH_WATERMARK=" +
          dynamicHighWatermark +
          ", maxBatchBytes=" +
          dynamicMaxBatchBytes,
        contexto
      );
    }
  });

  const BATCH_ROWS_CAP = BATCH_SIZE;
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

  const limit = pLimit(INSERT_MAX_CONCURRENT);
  const inflight = new Set();
  let maxInflight = 0;
  let totalInsertTime = 0;
  let insertCount = 0;

  let batch = [];
  let batchBytes = 0;
  let lidas = 0;
  let inseridosAteAgora = 0;
  let insertPhaseStarted = false;

  async function awaitSlotForInsert() {
    while (inflight.size >= dynamicAllowedInserts) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  async function doInsert(lote) {
    if (!insertPhaseStarted) {
      onInsertStart?.();
      insertPhaseStarted = true;
      updateActiveJob(contexto, {
        stage: "inserção",
        detail: "Inserções iniciadas",
      });
    }
    void logActivity("info", `Inserindo lote (${lote.length} linhas)`, {
      filePath: contexto,
    });
    updateActiveJob(contexto, { detail: `Inserindo lote (${lote.length})` });
    try {
      const skipUpdateClause = Boolean(metadados.applyPreDelete); // só pula UPDATE se fizemos pre-delete
      await insertBatchFn(tabela, lote, cols, { skipUpdateClause });
      inseridosAteAgora += lote.length;
      publishInsert?.(inseridosAteAgora);
      metrics.lastProgressTs = Date.now();
      void logActivity("info", `Lote concluído (${lote.length} linhas)`, {
        filePath: contexto,
      });
    } catch (e) {
      addAviso(`[BATCH][FALLBACK] Falha no lote de ${lote.length}. Provável duplicata/constraint.`, contexto);
      void logActivity(
        "warn",
        `Fallback para inserção linha-a-linha: ${e.message}`,
        { filePath: contexto }
      );
      let ok = 0,
        fail = 0;
      for (const row of lote) {
        try {
          await insertRegisterFn(tabela, row, cols);
          ok++;
          inseridosAteAgora++;
        } catch (err) {
          fail++;
          addErro(
            `Erro ao inserir linha ${inseridosAteAgora + 1}: ${err.message}`,
            contexto
          );
        }
      }
      updateActiveJob(contexto, {
        detail: `Fallback linha-a-linha (ok=${ok}, fail=${fail})`,
      });
      publishInsert?.(inseridosAteAgora);
      metrics.lastProgressTs = Date.now();
    } finally {
      addInfo(
        `[BATCH] Inseridos ${lote.length} linhas (até agora: ${inseridosAteAgora}).`,
        contexto
      );
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
    await awaitSlotForInsert();
    const p = limit(() => doInsert(lote));
    inflight.add(p);
    metrics.pendingBatches++;
    if (inflight.size > maxInflight) maxInflight = inflight.size;
    metrics.inFlightInserts = inflight.size;
    p.then(() => {
      totalInsertTime += Date.now() - start;
      insertCount++;
      metrics.lastProgressTs = Date.now();
    }).finally(() => {
      inflight.delete(p);
      metrics.pendingBatches--;
      metrics.inFlightInserts = inflight.size;
      updateActiveJob(contexto, { detail: `Lotes em voo: ${inflight.size}` });
    });
    addInfo(
      `[FLUSH] inflight_inserts=${inflight.size}, batch_len=${lote.length}, approx_bytes=${loteBytes}`,
      contexto
    );
    updateActiveJob(contexto, {
      detail: `Enviando lote (${lote.length} linhas)`,
    });
  }

  const { forHash, forParse } = createFileTee(workPath, { highWaterMark: HWM });
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
    if (isFirstRow) {
      isFirstRow = false;
      continue;
    }

    if (memoryGuard.isHigh()) {
      await memoryGuard.waitForNormal();
    }

    const obj = {};
    for (let i = 0; i < headersLen; i++) {
      const h = headersNorm[i];
      const v = row[i];
      obj[h] = v == null ? null : typeof v === "string" ? v.trim() : v;
    }

    const linhaTipada = sanitizeRow(obj, tiposFinal, contexto);
    const rowBytes = approxRowBytes(linhaTipada);

    if (
      batch.length > 0 &&
      (batch.length >= BATCH_ROWS_CAP ||
        batchBytes + rowBytes > dynamicMaxBatchBytes)
    ) {
      await flushBatch();
      while (inflight.size >= dynamicHighWatermark) {
        await Promise.race(inflight);
      }
      while (inflight.size > dynamicLowWatermark) {
        await Promise.race(inflight);
      }
    }

    batch.push(linhaTipada);
    batchBytes += rowBytes;
    lidas++;
    publishRead?.(lidas);
    metrics.lastProgressTs = Date.now();
  }

  await flushBatch();
  await Promise.all(inflight);

  const avgMs = insertCount ? totalInsertTime / insertCount : 0;
  addInfo(
    `[STATS] tempo_medio_lote=${avgMs.toFixed(
      2
    )}ms, pico_inflight=${maxInflight}`,
    contexto
  );
  void logActivity(
    "info",
    `[STATS] tempo_medio_lote=${avgMs.toFixed(
      2
    )}ms, pico_inflight=${maxInflight}`,
    {
      filePath: contexto,
    }
  );

  metadados.total_linhas = lidas;
  let hex = null;
  if (computeHash && hash) {
    hex = hash.digest("hex");
    metadados.hash = hex;
  }
  if (logData) {
    logData.total_linhas = lidas;
    if (hex) logData.hash_arquivo = hex;
  }
  offMem();

  return {
    erro: false,
    total: lidas,
    inseridos: inseridosAteAgora,
    falhas: Math.max(0, lidas - inseridosAteAgora),
    mensagem: null,
  };
}

export default streamPipeline;
