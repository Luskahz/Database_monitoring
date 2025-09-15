import { startLogger, logLine, logActivity } from "../middleware/logger.js";
import { silencePapaDuplicatesStart } from "./silencePapa.js";

const GLOBAL_CONTEXT = "__global";

try {
  startLogger(GLOBAL_CONTEXT);
  logLine(GLOBAL_CONTEXT, "info", "Logger global inicializado.").catch(() => {});
  logActivity("info", "Logger de atividade inicializado.").catch(() => {});
} catch (err) {
  console.error("[logger] Falha ao iniciar logger global:", err?.message || err);
}

// Ativa o silêncio global para os avisos de header duplicado do PapaParse
silencePapaDuplicatesStart();
