import { startLogger, endLogger, logActivity } from "../middleware/logger.js";
import { memoryGuard } from "./memoryGuard.js";
import {
  clearAllErrors,
  flushAggregatedSummaries,
} from "../middleware/errorHandler.js";
import {
  ensureJob,
  markJobActive,
  markJobComplete,
  updateActiveJob,
  updateMemoryGuardListeners,
} from "./queueTracker.js";
import {
  finalizeStagedLogger,
  setupStagedLogger,
  shouldStageLogger,
} from "./loggerStaging.js";

const activeFiles = new Set();
export function getActiveFilesCount() {
  return activeFiles.size;
}

export async function withFileLifecycle(filePath, fn, lifecycleOpts = {}) {
  const { manageLogger = true, loggerOptions } = lifecycleOpts;

  let stagedLoggerInfo = null;
  let loggerStarted = false;
  let effectiveLoggerOptions = loggerOptions;

  if (manageLogger !== false) {
    effectiveLoggerOptions = { ...(loggerOptions || {}) };
    if (!effectiveLoggerOptions.logPath && shouldStageLogger(filePath)) {
      try {
        stagedLoggerInfo = await setupStagedLogger(filePath);
        if (stagedLoggerInfo?.localLogPath) {
          effectiveLoggerOptions.logPath = stagedLoggerInfo.localLogPath;
        }
      } catch (err) {
        stagedLoggerInfo = null;
        console.error(
          `[logger] Falha ao preparar log temporário (${filePath}):`,
          err?.message || err
        );
      }
    }

    try {
      startLogger(filePath, effectiveLoggerOptions);
      loggerStarted = true;
    } catch (err) {
      console.error(
        `[logger] Falha ao iniciar logger de ${filePath}:`,
        err?.message || err
      );
      if (stagedLoggerInfo) {
        try {
          await finalizeStagedLogger(stagedLoggerInfo, { skipCopy: true });
        } catch (cleanupErr) {
          console.error(
            `[logger] Falha ao descartar log temporário de ${filePath}:`,
            cleanupErr?.message || cleanupErr
          );
        }
        stagedLoggerInfo = null;
      }
    }
  }
  activeFiles.add(filePath);

  const { job: rawJob, action } = lifecycleOpts;
  const job = markJobActive(
    ensureJob(rawJob, filePath, action),
    { stage: "inicializando", progress: 0, detail: action ? `Ação: ${action}` : "Preparando" }
  );
  updateActiveJob(filePath, { stage: "inicializando", progress: 0, detail: "Preparando recursos" });
  void logActivity("info", `Processamento iniciado${action ? ` (${action})` : ""}`, {
    filePath,
    action: job?.action,
  });

  const off = memoryGuard.onChange(() => {});
  updateMemoryGuardListeners(memoryGuard.listenerCount());

  let caughtError = null;
  try {
    await fn();
    updateActiveJob(filePath, { progress: 1, stage: "finalizando", detail: "Finalizando" });
  } catch (err) {
    caughtError = err;
    updateActiveJob(filePath, {
      stage: "erro",
      detail: err?.message ? err.message.slice(0, 200) : String(err),
    });
    throw err;
  } finally {
    try {
      if (manageLogger !== false) {
        await flushAggregatedSummaries(filePath);
        await endLogger(filePath);
      }
    } catch (err) {
      console.error(`[logger] Falha ao finalizar logger de ${filePath}:`, err?.message || err);
    } finally {
      if (stagedLoggerInfo) {
        try {
          await finalizeStagedLogger(stagedLoggerInfo, { skipCopy: !loggerStarted });
        } catch (err) {
          console.error(
            `[logger] Falha ao consolidar log de ${filePath}:`,
            err?.message || err
          );
        }
      }
      off();
      updateMemoryGuardListeners(memoryGuard.listenerCount());
      clearAllErrors(filePath);
      activeFiles.delete(filePath);
      markJobComplete(job, { success: !caughtError, error: caughtError });
      const level = caughtError ? "error" : "info";
      const message = caughtError
        ? `Processamento falhou: ${caughtError?.message || caughtError}`
        : "Processamento concluído";
      void logActivity(level, message, { filePath, action: job?.action });
    }
  }
}
