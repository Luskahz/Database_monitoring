export default function colunsValidator(json_coluns, table_coluns) {
  let isEqual = true;

  const maxLen = Math.max(json_coluns.length, table_coluns.length);
  for (let i = 0; i < maxLen; i++) {
    const jsonCol = json_coluns[i];
    const tableCol = table_coluns[i];

    if (jsonCol !== tableCol) {
      isEqual = false;
      console.warn(`❌ Diferença na posição ${i}:
  → JSON:   '${jsonCol}'
  → TABELA: '${tableCol}'`);
    }
  }

  console.log("Colunas iguais? ➝", isEqual);
  return isEqual;
}