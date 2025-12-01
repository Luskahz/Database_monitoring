import chokidar from "chokidar";
import pLimit from "p-limit";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

import { FILES_MAX_CONCURRENT, STAGING_DIR } from "../config/index.js";

import createdHandler from "./controller/Handlers/createdHandler.js";
import deletedHandler from "./controller/Handlers/deletedHandler.js";
import { addErro, addInfo } from "./middleware/errorHandler.js";

import { metrics as pipelineMetrics } from "./utils/streamPipeline.js";
import { getActiveFilesCount } from "./utils/withFileLifecycle.js";
import { memoryGuard } from "./utils/memoryGuard.js";
import { startWatchdog } from "./monitoring/watchdog.js";
import { setupGracefulShutdown } from "./utils/gracefulShutdown.js";
import { endAllLoggers } from "./middleware/logger.js";
import { shutdownPool } from "../config/dbPool.js";
import isCsvFile from "./utils/isCsvFile.js";
import {
  enqueueFileJob,
  updateDebounceSize,
  updateMetrics as updateQueueMetrics,
} from "./utils/queueTracker.js";
import { toNumber } from "./utils/normalizar.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const limit = pLimit(FILES_MAX_CONCURRENT);
const bigLimit = pLimit(Math.min(FILES_MAX_CONCURRENT, 4));
const debounceTimers = new Map();

function runWithDebounce(filePath, acao, handler) {
  const prev = debounceTimers.get(filePath);
  if (prev) clearTimeout(prev.timer);
  const timer = setTimeout(() => {
    let chosen = limit;
    try {
      const stats = fs.statSync(filePath);
      const fileSizeMB = stats.size / (1024 * 1024);
      if (fileSizeMB >= 100) chosen = bigLimit;
    } catch {}

    const job = enqueueFileJob(filePath, acao);
    addInfo(
      `[MONITOR] Enqueued job id=${job.id} file=${filePath} action=${acao}`,
      filePath
    );

    chosen(() => {
      addInfo(
        `[MONITOR] Dispatching job id=${job.id} file=${filePath} action=${acao}`,
        filePath
      );
      addInfo(
        `[${Date.now()}][MONITOR] Job START id=${
          job.id
        } file=${filePath} action=${acao}`,
        filePath
      );
      return handler(filePath, acao, job).finally(() => {
        addInfo(
          `[${Date.now()}][MONITOR] Job END   id=${
            job.id
          } file=${filePath} action=${acao}`,
          filePath
        );
      });
    }).catch((e) => {
      addErro(
        `[MONITOR] Erro ao processar arquivo ${filePath}: ${e.message}`,
        filePath
      );
    });

    debounceTimers.delete(filePath);
    updateDebounceSize(debounceTimers.size);
  }, 2000);
  debounceTimers.set(filePath, { timer, ts: Date.now() });
  updateDebounceSize(debounceTimers.size);
}

function purgeDebounceTimers() {
  const now = Date.now();
  for (const [fp, { timer, ts }] of debounceTimers) {
    if (now - ts > 7 * 60 * 1000 || !fs.existsSync(fp)) {
      clearTimeout(timer);
      debounceTimers.delete(fp);
    }
  }
  updateDebounceSize(debounceTimers.size);
}
const purgeInterval = setInterval(purgeDebounceTimers, 2 * 60 * 1000);
purgeInterval.unref?.();

export async function startMonitoring() {
  const monitorPath =
    process.env.MONITOR_PATH ||
    path.resolve(
      __dirname,
      "\\\\192.168.0.213\\Files\\Logistica\\0.DPO\\Diretórios_SQL"
    );

  const awfStability = toNumber(process.env.AWF_STABILITY_MS, 2000);
  const awfPoll = toNumber(process.env.AWF_POLL_MS, 500);

  const ignoredPatterns = [
    /[/\\]database_monitoring[/\\]/,
    /[/\\]scripts[/\\]/,
    /[/\\]loggers[/\\]/,
    /\.txt$/,
  ];
  if (STAGING_DIR) {
    const normalized = path.resolve(STAGING_DIR);
    ignoredPatterns.push(normalized);
    if (normalized.includes("\\")) {
      ignoredPatterns.push(normalized.replace(/\\/g, "/"));
    }
  }

  const watcher = chokidar.watch(monitorPath, {
    persistent: true,
    ignoreInitial: true,
    usePolling: true,
    interval: 10000, // 10 segundos entre varreduras
    binaryInterval: 10000,
    depth: 7, // suficiente pro seu nível
    alwaysStat: false, // evita chamadas extras de fs.stat()
    atomic: true,
    followSymlinks: false,
    ignorePermissionErrors: true,
    awaitWriteFinish: {
      stabilityThreshold: awfStability,
      pollInterval: awfPoll,
    },
    ignored: ignoredPatterns,
  });

  watcher
    .on("add", (filePath) => {
      if (!isCsvFile(filePath)) return;
      console.log(`🟢 Arquivo adicionado: ${filePath}`);
      runWithDebounce(filePath, "created", createdHandler);
    })
    .on("change", (filePath) => {
      if (!isCsvFile(filePath)) return;
      console.log(`🟡 Arquivo modificado: ${filePath}`);
      runWithDebounce(filePath, "modified", createdHandler);
    })
    .on("unlink", (filePath) => {
      if (!isCsvFile(filePath)) return;
      console.log(`🔴 Arquivo removido: ${filePath}`);
      runWithDebounce(filePath, "deleted", deletedHandler);
    })
    .on("error", (error) => {
      console.error(`❌ Erro no monitoramento: ${error}`);
      addErro(`Erro no monitoramento, erro: ${error.message}`);
    })
    .on("ready", () => {
      console.log(`✅ Pronto! Monitorando alterações em: ${monitorPath}`);
    });

  const watchdogInterval = startWatchdog(() => ({
    activeFiles: getActiveFilesCount(),
    pendingBatches: pipelineMetrics.pendingBatches,
    inFlightInserts: pipelineMetrics.inFlightInserts,
    debounceTimersSize: debounceTimers.size,
    memoryGuardListeners: memoryGuard.listenerCount(),
    lastProgressTs: pipelineMetrics.lastProgressTs,
    filesMaxConcurrent: FILES_MAX_CONCURRENT,
  }));

  updateQueueMetrics({ filesMaxConcurrent: FILES_MAX_CONCURRENT });

  setupGracefulShutdown({
    watcher,
    pool: { end: shutdownPool },
    logManager: { endAll: endAllLoggers },
    timers: [purgeInterval, watchdogInterval],
  });
}
