export default function colunsValidator(json_coluns, table_coluns) {
  const erros = [];
  const maxLen = Math.max(json_coluns.length, table_coluns.length);

  for (let i = 0; i < maxLen; i++) {
    const jsonCol = json_coluns[i];
    const tableCol = table_coluns[i];

    if (jsonCol !== tableCol) {
      erros.push(
        `❌ Diferença na posição ${i}:\n  → JSON:   '${jsonCol}'\n  → TABELA: '${tableCol}'`
      );
    }
  }

  if (erros.length > 0) {
    return erros.join("\n\n");
  }

  return "✅ Colunas iguais";
}
