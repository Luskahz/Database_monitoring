import { config } from "dotenv";
config();

const PERF_ENABLED = process.env.PERF_LOGS === "true";
const perfMarks = new Map();

/**
 * Inicia uma medição de tempo (em ms)
 */
export function startPerf(label, context = "") {
  if (!PERF_ENABLED) return;
  const key = context ? `${label}::${context}` : label;
  perfMarks.set(key, process.hrtime.bigint());
}

/**
 * Finaliza e exibe o tempo gasto.
 */
export function endPerf(label, context = "", extra = null) {
  if (!PERF_ENABLED) return 0;
  const key = context ? `${label}::${context}` : label;
  const start = perfMarks.get(key);
  if (!start) return 0;

  const diff = Number(process.hrtime.bigint() - start) / 1_000_000;
  perfMarks.delete(key);

  let msg = `[PERF] ${label.padEnd(35)} ${diff.toFixed(2)}ms`;
  if (context) msg += ` | ${context}`;
  if (extra && typeof extra === "object") {
    try {
      msg += ` ${JSON.stringify(extra)}`;
    } catch {}
  }
  console.log(msg);
  return diff;
}

/**
 * Mede automaticamente uma função síncrona
 */
export function measureSync(label, fn, context = "", extra = null) {
  if (!PERF_ENABLED) return fn();
  startPerf(label, context);
  const result = fn();
  endPerf(label, context, extra);
  return result;
}

/**
 * Mede automaticamente uma função assíncrona
 */
export async function measureAsync(label, fn, context = "", extra = null) {
  if (!PERF_ENABLED) return await fn();
  startPerf(label, context);
  const result = await fn();
  endPerf(label, context, extra);
  return result;
}

/**
 * Wrapper de conveniência para qualquer função async (usa try/finally)
 */
export async function perfWrap(label, context, fn) {
  if (!PERF_ENABLED) return await fn();
  startPerf(label, context);
  try {
    const result = await fn();
    endPerf(label, context);
    return result;
  } catch (err) {
    endPerf(label, context, { erro: err.message });
    throw err;
  }
}

/**
 * Limpa medições e evita acumular memória
 */
export function clearPerf() {
  if (!PERF_ENABLED) return;
  perfMarks.clear();
}

/**
 * Mostra se o logger está ativo
 */
export function isPerfEnabled() {
  return PERF_ENABLED;
}
