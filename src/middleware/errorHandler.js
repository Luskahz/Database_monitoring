import { appendLine, fmtTimeNow } from "./logger.js";

const contextoDeMensagens = new Map();

/* ─────────────────────────────── */
/* Função central de log           */
/* ─────────────────────────────── */
async function safeAppendToLog(contexto, tipo, msg) {
  const t = fmtTimeNow();
  
  const line = `[${t}][${tipo.toUpperCase()}][${contexto}] ${msg}\n`;

  return appendLine(contexto, line).catch((e) => {
    console.error(`[Logger] Falha ao gravar log (${contexto}):`, e.message);
  });
}

/* ─────────────────────────────── */
/* Controle de contexto em memória */
/* ─────────────────────────────── */
function ensureContext(contexto) {
  if (!contextoDeMensagens.has(contexto)) {
    contextoDeMensagens.set(contexto, { erros: [], infos: [], avisos: [] });
  }
  return contextoDeMensagens.get(contexto);
}

export function addErro(msg, contexto = "__global") {
  const bag = ensureContext(contexto);
  bag.erros.push(msg);
  void safeAppendToLog(contexto, "erro", msg);
}

export function addInfo(msg, contexto = "__global") {
  const bag = ensureContext(contexto);
  bag.infos.push(msg);
  void safeAppendToLog(contexto, "info", msg);
}

export function addAviso(msg, contexto = "__global") {
  const bag = ensureContext(contexto);
  bag.avisos.push(msg);
  void safeAppendToLog(contexto, "aviso", msg);
}

/* ─────────────────────────────── */
/* Utilitários                     */
/* ─────────────────────────────── */
export function getAllErrors(contexto = "__global") {
  return (
    contextoDeMensagens.get(contexto) || { erros: [], infos: [], avisos: [] }
  );
}
export function clearAllErrors(contexto = "__global") {
  contextoDeMensagens.set(contexto, { erros: [], infos: [], avisos: [] });
}
export function clearAllContexts() {
  contextoDeMensagens.clear();
}
