import cliProgress from "cli-progress";

export const multiBar = new cliProgress.MultiBar(
  {
    clearOnComplete: false,
    hideCursor: true,
    format:
      "[{filename} - {ano}] → [{bar}] {percentage}% | [{value}/{total}  {tabela}]",
    barCompleteChar: "\u2588",
    barIncompleteChar: "\u2591",
    autopadding: false,
    stopOnComplete: false,
    fps: 5,
  },
  cliProgress.Presets.shades_grey
);

const barras = new Map();
let barrasAtivas = 0;

/**
 * Cria uma barra de progresso identificada por ID único
 */
export function iniciarBarra(id, total, filename, tabela, ano) {
  if (barras.has(id)) return;

  const bar = multiBar.create(total, 0, {
    filename,
    tabela,
    ano, // adiciona o ano
  });

  barras.set(id, bar);
  barrasAtivas++;
}

/**
 * Incrementa o valor da barra de progresso
 */
export function atualizarBarra(id) {
  const bar = barras.get(id);
  if (bar) {
    bar.increment();
  }
}

/**
 * Finaliza e remove a barra do controle
 */
export async function finalizarBarra(id) {
  const bar = barras.get(id);
  if (bar) {
    if (bar.value < bar.getTotal()) {
      bar.update(bar.value); // força refresh da linha com valor real
      await new Promise((r) => setTimeout(r, 20)); // dá tempo de atualizar
    }
    bar.stop();
    barras.delete(id);
    barrasAtivas--;
  }

  if (barras.size === 0) {
    multiBar.stop();
  }
}

/**
 * Verifica se há alguma barra em execução
 */
export function isBarraAtiva() {
  return barrasAtivas > 0;
}

/**
 * Loga uma mensagem fora do bloco da barra
 */
export function logBarra(mensagem) {
  multiBar.log(mensagem);
}

export function finalizarTodasAsBarras() {
  for (const id of barras.keys()) {
    finalizarBarra(id);
  }
}


