import { logLine } from "../middleware/logger.js";

export function startWatchdog(getMetrics, intervalMs = 60000, stallMs = Number(process.env.STALL_MS || 5 * 60 * 1000)) {
  const interval = setInterval(() => {
    const m = getMetrics();
    logLine("__global", "info", `[watchdog] files=${m.activeFiles} pending=${m.pendingBatches} inflight=${m.inFlightInserts} debounce=${m.debounceTimersSize} listeners=${m.memoryGuardListeners}`);
    if (Date.now() - m.lastProgressTs > stallMs && m.inFlightInserts > 0) {
      logLine("__global", "warn", "[watchdog] possível stall detectado");
    }
  }, intervalMs);
  interval.unref?.();
  return interval;
}
