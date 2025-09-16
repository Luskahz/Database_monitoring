import { logLine, logActivity } from "../middleware/logger.js";

export function setupGracefulShutdown({ watcher, pool, logManager, timers = [] }) {
  async function shutdown() {
    try { logLine("__global", "info", "iniciando shutdown..."); } catch {}
    try { void logActivity("info", "Shutdown iniciado"); } catch {}
    try { await watcher?.close?.(); } catch {}
    try { await logManager?.endAll?.(); } catch {}
    try { await pool?.end?.(); } catch {}
    for (const t of timers) {
      try { clearInterval(t); } catch {}
    }
  }
  ["SIGINT", "SIGTERM"].forEach((sig) => {
    process.on(sig, () => {
      shutdown().finally(() => process.exit(0));
    });
  });
}
