import cliProgress from "cli-progress";

export const multiBar = new cliProgress.MultiBar(
  {
    clearOnComplete: false,
    hideCursor: true,
    format: "[{filename} - {ano}] → [{bar}] {percentage}% | [{value}/{total} {tabela}] {status}",
    barCompleteChar: "\u2588",
    barIncompleteChar: "\u2591",
    autopadding: false,
    stopOnComplete: false,
    fps: 5, 
  },
  cliProgress.Presets.shades_grey
);


const barras = new Map(); 
const pendentes = new Map();

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
    st.bar.update(st.value, mudouStatus ? { status: st.status } : undefined);
  }
}

function schedule(id) {
  const p = pendentes.get(id);
  if (!p || p.timer) return;
  // agrega por ~50ms (ajuste fino)
  p.timer = setTimeout(() => {
    p.timer = null;
    flush(id);
  }, 50);
}

export function iniciarBarra(id, total, filename, tabela, ano) {
  if (barras.has(id)) return;
  const bar = multiBar.create(total, 0, { filename, tabela, ano, status: "" });
  barras.set(id, { bar, total, value: 0, status: "" });
}

export function atualizarBarra(id, valor = 1, status) {
  const st = barras.get(id);
  if (!st) return;

  // agrega updates: 1 render por ciclo
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
  // garante consistência se total diminuiu
  if (st.value > st.total) {
    st.value = st.total;
    st.bar.setTotal(st.total);
    st.bar.update(st.value, { status: st.status });
  } else {
    st.bar.setTotal(st.total);
  }
}

export async function finalizarBarra(id) {
  const st = barras.get(id);
  if (!st) return;

  // força aplicar o que estiver pendente
  flush(id);

  // refresh final
  st.bar.update(st.value, { status: st.status });
  await new Promise((r) => setTimeout(r, 10));

  st.bar.stop();
  barras.delete(id);

  if (barras.size === 0) {
    multiBar.stop();
  }
}

export function isBarraAtiva() {
  return barras.size > 0;
}

export function logBarra(mensagem) {
  // imprime acima das barras sem quebrar layout
  if (typeof multiBar.interrupt === "function") {
    multiBar.interrupt(mensagem);
  } else {
    multiBar.log(mensagem);
  }
}

export async function finalizarTodasAsBarras() {
  const ids = Array.from(barras.keys());
  for (const id of ids) {
    await finalizarBarra(id);
  }
}
