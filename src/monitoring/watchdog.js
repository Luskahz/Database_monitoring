import os from "node:os";
import { logActivity } from "../middleware/logger.js";
import { updateMetrics as updateQueueMetrics, updateMemoryGuardListeners } from "../utils/queueTracker.js";
import { query } from "../../config/dbPool.js";

let dbCheckInFlight = false;

export function startWatchdog(getMetrics, intervalMs = 60000, stallMs = Number(process.env.STALL_MS || 5 * 60 * 1000)) {
  const interval = setInterval(() => {
    const m = getMetrics();
    updateQueueMetrics({
      pendingBatches: m.pendingBatches,
      inFlightInserts: m.inFlightInserts,
      lastProgressTs: m.lastProgressTs,
      activeFiles: m.activeFiles,
      filesMaxConcurrent: m.filesMaxConcurrent,
      memoryUsage: process.memoryUsage(),
      loadAverage: os.loadavg(),
    });
    updateMemoryGuardListeners(m.memoryGuardListeners);

    if (Date.now() - m.lastProgressTs > stallMs && (m.pendingBatches > 0 || m.inFlightInserts > 0)) {
      void logActivity(
        "warn",
        `Watchdog: possível stall detectado (pending=${m.pendingBatches}, inflight=${m.inFlightInserts})`
      );
    }

    if (!dbCheckInFlight) {
      dbCheckInFlight = true;
      void (async () => {
        const started = Date.now();
        try {
          const [{ total } = {}] = await query(
            "SELECT COUNT(*) AS total FROM information_schema.processlist"
          );
          const statusRows = await query("SHOW STATUS LIKE 'Threads_connected'");
          const threadsConnectedRaw =
            statusRows?.[0]?.Value ?? statusRows?.[0]?.value ?? null;
          const threadsConnected = threadsConnectedRaw != null ? Number(threadsConnectedRaw) : null;
          const latencyMs = Date.now() - started;
          const processCountNumber = Number(total);
          updateQueueMetrics({
            dbStatus: {
              processCount: Number.isFinite(processCountNumber)
                ? processCountNumber
                : total,
              threadsConnected: Number.isFinite(threadsConnected)
                ? threadsConnected
                : threadsConnectedRaw,
              latencyMs,
              checkedAt: Date.now(),
            },
          });
          void logActivity(
            "info",
            `DB status: threads=${threadsConnected ?? threadsConnectedRaw ?? "n/a"} | processlist=${total ?? "n/a"} | latency=${latencyMs}ms`,
            { action: "db-status" }
          );
        } catch (err) {
          const message = err?.message || String(err);
          updateQueueMetrics({
            dbStatus: {
              error: message,
              checkedAt: Date.now(),
            },
          });
          void logActivity("error", `DB status check failed: ${message}`, { action: "db-status" });
        } finally {
          dbCheckInFlight = false;
        }
      })();
    }
  }, intervalMs);
  interval.unref?.();
  return interval;
}
