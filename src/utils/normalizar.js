export default function normalizar(nome) {
  return nome
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/%/g, "perc") // % → perc
    .replace(/\s*\.\s*/g, "_") // ponto entre palavras → _
    .replace(/\./g, "") // outros pontos → remove
    .replace(/[-\\/]/g, "_")
    .replace(/\s+/g, "_") // espaço → _
    .replace(/[^a-zA-Z0-9_]/g, "") // remove outros símbolos
    .replace(/_+/g, "_") // evita múltiplos __
    .replace(/^_+|_+$/g, "") // remove _ início/fim
    .toLowerCase();
}

export function normalizarValores(nome) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/%/g, "perc") // % → perc
    .replace(/\s*\.\s*/g, "_") // ponto entre palavras → _
    .replace(/\./g, "") // outros pontos → remove
    .replace(/\s+/g, "_") // espaço → _
    .replace(/[^a-zA-Z0-9_]/g, "") // remove outros símbolos
    .replace(/_+/g, "_") // evita múltiplos __
    .replace(/^_+|_+$/g, "") // remove _ início/fim
    .toLowerCase();
}
