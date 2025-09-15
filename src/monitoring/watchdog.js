import { logActivity } from "../middleware/logger.js";
import { updateMetrics as updateQueueMetrics, updateMemoryGuardListeners } from "../utils/queueTracker.js";

export function startWatchdog(getMetrics, intervalMs = 60000, stallMs = Number(process.env.STALL_MS || 5 * 60 * 1000)) {
  const interval = setInterval(() => {
    const m = getMetrics();
    updateQueueMetrics({
      pendingBatches: m.pendingBatches,
      inFlightInserts: m.inFlightInserts,
      lastProgressTs: m.lastProgressTs,
      activeFiles: m.activeFiles,
      filesMaxConcurrent: m.filesMaxConcurrent,
    });
    updateMemoryGuardListeners(m.memoryGuardListeners);

    if (Date.now() - m.lastProgressTs > stallMs && (m.pendingBatches > 0 || m.inFlightInserts > 0)) {
      void logActivity(
        "warn",
        `Watchdog: possível stall detectado (pending=${m.pendingBatches}, inflight=${m.inFlightInserts})`
      );
    }
  }, intervalMs);
  interval.unref?.();
  return interval;
}
