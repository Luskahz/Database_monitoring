// errorHandler.js
import { appendLine } from "./logger.js";

// <-- FALTAVA ISSO
const contextoDeMensagens = new Map();

function safeAppendToLog(contexto, tipo, msg) {
  const now = new Date().toISOString();
  // não propaga erro de IO do log
  return appendLine(
    contexto,
    `[${now}] [${tipo.toUpperCase()}] ${msg}\n`
  ).catch((e) => {
    // último recurso: não derruba o fluxo por erro de log
    console.error(`[Logger] Falha ao gravar log (${contexto}):`, e.message);
  });
}

function ensureContext(contexto) {
  if (!contextoDeMensagens.has(contexto)) {
    contextoDeMensagens.set(contexto, { erros: [], infos: [], avisos: [] });
  }
  return contextoDeMensagens.get(contexto);
}

export function addErro(msg, contexto = "__global") {
  const bag = ensureContext(contexto);
  bag.erros.push(msg);
  // não await: logging não bloqueia fluxo
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

// utilitários (se você ainda usa em algum lugar)
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
