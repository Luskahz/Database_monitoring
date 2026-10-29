import path from "node:path";

export const DEFAULT_MONITOR_PATH = "\\\\192.168.0.213\\Files\\Logistica\\0.DPO\\Diretórios_SQL";

export function annualRange({ ano, mes, dia, nome_arquivo }) {
  if (mes !== "anual" || dia != null || !/^[1-9]\d{3}\.csv$/i.test(nome_arquivo || "")) return null;
  if (String(ano) !== nome_arquivo.slice(0, 4) || Number(ano) >= 9999) return null;
  return [`${ano}-01-01`, `${Number(ano) + 1}-01-01`];
}

// Só a posição exata raiz/tabela/AAAA.csv habilita a nova interpretação.
export function annualDestination(filePath, monitorRoot = process.env.MONITOR_PATH || DEFAULT_MONITOR_PATH) {
  const relative = path.relative(path.resolve(monitorRoot), path.resolve(filePath));
  const parts = relative.split(path.sep);
  const atTableRoot = parts.length === 2 && parts[0] !== ".." && !path.isAbsolute(relative);
  const name = path.basename(filePath).toLowerCase();
  if (!atTableRoot) {
    if (/^[1-9]\d{3}\.csv$/i.test(name)) {
      throw new Error("[Anual] Arquivo AAAA.csv deve ficar diretamente em MONITOR_PATH/tabela/AAAA.csv.");
    }
    return null;
  }
  if (!/^[1-9]\d{3}\.csv$/.test(name) || name.startsWith("9999")) {
    throw new Error("[Anual] Nome inválido na raiz da tabela: use somente AAAA.csv (anos 1000 a 9998).");
  }
  const table = parts[0].toLowerCase();
  if (!/^[a-z0-9_]+$/.test(table) || table === "global" || /^\d{4}$/.test(table)) {
    throw new Error("[Anual] Pasta de tabela inválida.");
  }
  return { nome_arquivo: name, ano: name.slice(0, 4), mes: "anual", dia: null,
    tabela_destino: table, periodicidade: "anual" };
}
