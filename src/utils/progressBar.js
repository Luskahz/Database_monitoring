import cliProgress from "cli-progress";

export const multiBar = new cliProgress.MultiBar(
  {
    clearOnComplete: false,
    hideCursor: true,
    format:
      "[{filename} - {ano}] → [{bar}] {percentage}% | [{value}/{total} {tabela}] {status}",
    barCompleteChar: "\u2588",
    barIncompleteChar: "\u2591",
    autopadding: false,
    stopOnComplete: false,
    fps: 5,
  },
  cliProgress.Presets.shades_grey
);

const barras = new Map();

export function iniciarBarra(id, total, filename, tabela, ano) {
  if (barras.has(id)) return;
  const bar = multiBar.create(total, 0, {
    filename,
    tabela,
    ano,
    status: "", // placeholder
  });
  barras.set(id, bar);
}

export function atualizarBarra(id, valor = 1, status) {
  const bar = barras.get(id);
  if (!bar) return;

  if (typeof status === "string") {
    // atualiza payload sem mexer em value
    bar.update(bar.value, { status });
  }
  if (valor !== 0) {
    bar.increment(valor);
  }
}

export function setTotalBarra(id, novoTotal) {
  const bar = barras.get(id);
  if (!bar) return;
  bar.setTotal(novoTotal);
}

export async function finalizarBarra(id) {
  const bar = barras.get(id);
  if (!bar) return;

  // refresh final da linha
  bar.update(bar.value);
  await new Promise((r) => setTimeout(r, 10));

  bar.stop();
  barras.delete(id);

  if (barras.size === 0) {
    multiBar.stop();
  }
}

export function isBarraAtiva() {
  return barras.size > 0;
}

export function logBarra(mensagem) {
  multiBar.log(mensagem);
}

export function finalizarTodasAsBarras() {
  for (const id of Array.from(barras.keys())) {
    finalizarBarra(id);
  }
}
