// Error handler ajustado para usar caminho curto e mensagens higienizadas com o logger compacto.
import { logLine, shortPath, shortenPathsInMsg } from "./logger.js";

const contextoDeMensagens = new Map();

function createBag() {
  return {
    erros: [],
    infos: [],
    avisos: [],
    countErros: new Map(),
    countAvisos: new Map(),
    summariesFlushed: false,
  };
}

/* ─────────────────────────────── */
/* Função central de log           */
/* ─────────────────────────────── */
export function getShortCtx(contexto) {
  return shortPath(contexto || "");
}

async function safeAppendToLog(contexto, tipo, msg) {
  const shortCtx = getShortCtx(contexto) || contexto;
  const cleanMsg = shortenPathsInMsg(msg, shortCtx);
  return logLine(contexto, tipo, `[${shortCtx}] ${cleanMsg}`).catch((e) => {
    console.error(`[Logger] Falha ao gravar log (${contexto}):`, e.message);
  });
}

/* ─────────────────────────────── */
/* Controle de contexto em memória */
/* ─────────────────────────────── */
function ensureContext(contexto) {
  if (!contextoDeMensagens.has(contexto)) {
    contextoDeMensagens.set(contexto, createBag());
  }
  return contextoDeMensagens.get(contexto);
}

export function addErro(msg, contexto = "__global") {
  const bag = ensureContext(contexto);
  bag.erros.push(msg);
  const nextCount = (bag.countErros.get(msg) || 0) + 1;
  bag.countErros.set(msg, nextCount);
  if (nextCount <= 5) {
    void safeAppendToLog(contexto, "erro", msg);
  }
}

export function addInfo(msg, contexto = "__global") {
  const bag = ensureContext(contexto);
  bag.infos.push(msg);
  void safeAppendToLog(contexto, "info", msg);
}

export function addAviso(msg, contexto = "__global") {
  const bag = ensureContext(contexto);
  bag.avisos.push(msg);
  const nextCount = (bag.countAvisos.get(msg) || 0) + 1;
  bag.countAvisos.set(msg, nextCount);
  if (nextCount <= 5) {
    void safeAppendToLog(contexto, "aviso", msg);
  }
}

/* ─────────────────────────────── */
/* Utilitários                     */
/* ─────────────────────────────── */
export function getAllErrors(contexto = "__global") {
  return contextoDeMensagens.get(contexto) || createBag();
}
export function clearAllErrors(contexto = "__global") {
  contextoDeMensagens.set(contexto, createBag());
}
export function clearAllContexts() {
  contextoDeMensagens.clear();
}

export async function flushAggregatedSummaries(contexto = "__global") {
  const bag = ensureContext(contexto);
  if (!bag || bag.summariesFlushed) return;

  const summaryEntries = [];

  for (const [msg, count] of bag.countErros.entries()) {
    if (count > 5) {
      const remaining = count - 5;
      const summary = `Mais ${remaining} linhas apresentaram o mesmo erro acima: ${msg}. (Total: ${count} ocorrências)`;
      bag.erros.push(summary);
      summaryEntries.push({ tipo: "erro", texto: summary });
    }
  }

  for (const [msg, count] of bag.countAvisos.entries()) {
    if (count > 5) {
      const remaining = count - 5;
      const summary = `Mais ${remaining} linhas apresentaram o mesmo aviso acima: ${msg}. (Total: ${count} ocorrências)`;
      bag.avisos.push(summary);
      summaryEntries.push({ tipo: "aviso", texto: summary });
    }
  }

  bag.summariesFlushed = true;

  await Promise.all(
    summaryEntries.map(({ tipo, texto }) => safeAppendToLog(contexto, tipo, texto))
  );
}

export async function flushAllAggregatedSummaries() {
  const contexts = Array.from(contextoDeMensagens.keys());
  await Promise.all(contexts.map((ctx) => flushAggregatedSummaries(ctx)));
}
