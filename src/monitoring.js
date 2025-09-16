import chokidar from "chokidar";
import pLimit from "p-limit";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import createdHandler from "./controller/Handlers/createdHandler.js";
import deletedHandler from "./controller/Handlers/deletedHandler.js";
import { addErro } from "./middleware/errorHandler.js";
import { FILES_MAX_CONCURRENT, metrics as pipelineMetrics } from "./utils/streamPipeline.js";
import { getActiveFilesCount } from "./utils/withFileLifecycle.js";
import { memoryGuard } from "./utils/memoryGuard.js";
import { startWatchdog } from "./monitoring/watchdog.js";
import { setupGracefulShutdown } from "./utils/gracefulShutdown.js";
import { endAllLoggers } from "./middleware/logger.js";
import { shutdownPool } from "../config/dbPool.js";
import {
  enqueueFileJob,
  updateDebounceSize,
  updateMetrics as updateQueueMetrics,
} from "./utils/queueTracker.js";

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
      if (fileSizeMB >= 200) chosen = bigLimit;
    } catch {}
    const job = enqueueFileJob(filePath, acao);
    chosen(() => handler(filePath, acao, job)).catch((e) => {
      console.log(`[monitoramento] Erro ao processar arquivo cujo path é: ${filePath}, erro: ${e.message}`);
    });
    debounceTimers.delete(filePath);
    updateDebounceSize(debounceTimers.size);
  }, 500);
  debounceTimers.set(filePath, { timer, ts: Date.now() });
  updateDebounceSize(debounceTimers.size);
}

function purgeDebounceTimers() {
  const now = Date.now();
  for (const [fp, { timer, ts }] of debounceTimers) {
    if (now - ts > 15 * 60 * 1000 || !fs.existsSync(fp)) {
      clearTimeout(timer);
      debounceTimers.delete(fp);
    }
  }
  updateDebounceSize(debounceTimers.size);
}
const purgeInterval = setInterval(purgeDebounceTimers, 10 * 60 * 1000);
purgeInterval.unref?.();

export async function startMonitoring() {
  const monitorPath = path.resolve(
    __dirname,
    "\\\\192.168.0.213\\Files\\Logistica\\0.DPO\\Diretórios_SQL"
  );

  const awfStability = Number(process.env.AWF_STABILITY_MS || 1500);
  const awfPoll = Number(process.env.AWF_POLL_MS || 100);

  const watcher = chokidar.watch(monitorPath, {
    persistent: true,
    ignoreInitial: true,
    usePolling: true,
    interval: 2000,
    depth: 10,
    atomic: 200,
    ignorePermissionErrors: true,
    ignored: [/[/\\]database_monitoring[/\\]/, /[/\\]loggers[/\\]/, /\.txt$/],
    awaitWriteFinish: {
      stabilityThreshold: awfStability,
      pollInterval: awfPoll,
    },
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

