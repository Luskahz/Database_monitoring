import { startLogger, endLogger, logActivity } from "../middleware/logger.js";
import { memoryGuard } from "./memoryGuard.js";
import { clearAllErrors } from "../middleware/errorHandler.js";
import {
  ensureJob,
  markJobActive,
  markJobComplete,
  updateActiveJob,
  updateMemoryGuardListeners,
} from "./queueTracker.js";

const activeFiles = new Set();
export function getActiveFilesCount() {
  return activeFiles.size;
}

export async function withFileLifecycle(filePath, fn, lifecycleOpts = {}) {
  const { manageLogger = true, loggerOptions } = lifecycleOpts;

  if (manageLogger !== false) {
    startLogger(filePath, loggerOptions);
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
        await endLogger(filePath);
      }
    } catch (err) {
      console.error(`[logger] Falha ao finalizar logger de ${filePath}:`, err?.message || err);
    } finally {
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
