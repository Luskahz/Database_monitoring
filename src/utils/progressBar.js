import cliProgress from "cli-progress";
import process from "node:process";

const forcePlainProgress = ["1", "true", "yes", "sim"].includes(
  String(process.env.PROGRESS_PLAIN_MODE || "").trim().toLowerCase()
);
const supportsInteractiveBars = !forcePlainProgress && Boolean(process.stdout?.isTTY);

export const multiBar = supportsInteractiveBars
  ? new cliProgress.MultiBar(
      {
        clearOnComplete: false,
        hideCursor: true,
        format: "[{filename} - {ano}] -> [{bar}] {percentage}% | [{value}/{total} {tabela}] {status}",
        barCompleteChar: "\u2588",
        barIncompleteChar: "\u2591",
        autopadding: false,
        stopOnComplete: false,
        fps: 5,
      },
      cliProgress.Presets.shades_grey
    )
  : null;

const barras = new Map();
const pendentes = new Map();

function normalizeMeta(meta = {}) {
  return {
    filename: meta.filename || "arquivo",
    tabela: meta.tabela || "tabela-desconhecida",
    ano: meta.ano ?? "-",
  };
}

function buildPlainLine(st) {
  const total = Math.max(0, Number(st.total) || 0);
  const value = Math.max(0, Math.min(total || 0, Number(st.value) || 0));
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const status = st.status ? ` ${st.status}` : "";
  return `[${st.meta.filename} - ${st.meta.ano}] -> ${pct}% | [${value}/${total} ${st.meta.tabela}]${status}`;
}

function shouldEmitPlainProgress(st, mudouStatus) {
  const total = Math.max(0, Number(st.total) || 0);
  const value = Math.max(0, Math.min(total || 0, Number(st.value) || 0));
  const pct = total > 0 ? Math.floor((value / total) * 100) : 0;
  const crossedStep =
    st.lastLoggedPercent == null ||
    pct >= st.lastLoggedPercent + 5 ||
    pct === 0 ||
    pct === 100;

  return mudouStatus || crossedStep;
}

function emitPlainProgress(st, mudouStatus = false) {
  if (!shouldEmitPlainProgress(st, mudouStatus)) return;
  const total = Math.max(0, Number(st.total) || 0);
  const value = Math.max(0, Math.min(total || 0, Number(st.value) || 0));
  const pct = total > 0 ? Math.floor((value / total) * 100) : 0;
  st.lastLoggedPercent = pct;
  console.log(buildPlainLine(st));
}

function flush(id) {
  const p = pendentes.get(id);
  if (!p) return;
  pendentes.delete(id);

  const st = barras.get(id);
  if (!st) return;

  const novo = Math.max(0, Math.min(st.total, st.value + (p.delta || 0)));
  const mudouValor = novo !== st.value;
  const mudouStatus = typeof p.status === "string" && p.status !== st.status;

  if (mudouValor || mudouStatus) {
    st.value = novo;
    if (mudouStatus) st.status = p.status;

    if (supportsInteractiveBars) {
      st.bar.update(st.value, {
        ...st.meta,
        status: st.status,
      });
    } else {
      emitPlainProgress(st, mudouStatus);
    }
  }
}

function schedule(id) {
  const p = pendentes.get(id);
  if (!p || p.timer) return;
  p.timer = setTimeout(() => {
    p.timer = null;
    flush(id);
  }, 50);
}

export function iniciarBarra(id, total, filename, tabela, ano) {
  if (barras.has(id)) return;

  const meta = normalizeMeta({ filename, tabela, ano });
  const state = {
    bar: supportsInteractiveBars ? multiBar.create(total, 0, { ...meta, status: "" }) : null,
    total,
    value: 0,
    status: "",
    meta,
    lastLoggedPercent: null,
  };

  barras.set(id, state);

  if (!supportsInteractiveBars) {
    emitPlainProgress(state, true);
  }
}

export function atualizarBarra(id, valor = 1, status) {
  const st = barras.get(id);
  if (!st) return;

  let p = pendentes.get(id);
  if (!p) {
    p = { delta: 0, status: undefined, timer: null };
    pendentes.set(id, p);
  }
  if (valor) p.delta += valor;
  if (typeof status === "string") p.status = status;

  schedule(id);
}

export function setTotalBarra(id, novoTotal) {
  const st = barras.get(id);
  if (!st) return;

  st.total = Math.max(0, Number(novoTotal) || 0);

  if (st.value > st.total) {
    st.value = st.total;
  }

  if (supportsInteractiveBars) {
    st.bar.setTotal(st.total);
    st.bar.update(st.value, { ...st.meta, status: st.status });
  } else {
    emitPlainProgress(st, true);
  }
}

export async function finalizarBarra(id) {
  const st = barras.get(id);
  if (!st) return;

  flush(id);

  if (supportsInteractiveBars) {
    st.bar.update(st.value, { ...st.meta, status: st.status });
    await new Promise((resolve) => setTimeout(resolve, 10));
    st.bar.stop();
  } else {
    emitPlainProgress(st, true);
  }

  barras.delete(id);

  if (supportsInteractiveBars && barras.size === 0) {
    multiBar.stop();
  }
}

export function isBarraAtiva() {
  return barras.size > 0;
}

export function logBarra(mensagem) {
  if (supportsInteractiveBars && typeof multiBar.interrupt === "function") {
    multiBar.interrupt(mensagem);
  } else {
    console.log(mensagem);
  }
}

export async function finalizarTodasAsBarras() {
  const ids = Array.from(barras.keys());
  for (const id of ids) {
    await finalizarBarra(id);
  }
}
