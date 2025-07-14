import { getDateColumnsFromTable } from "../model/tableModel.js"

export function normalizar(nome) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/%/g, "perc")           // % → perc
    .replace(/\s*\.\s*/g, "_")       // ponto entre palavras → _
    .replace(/\./g, "")              // outros pontos → remove
    .replace(/[-\\/]/g, "_")   
    .replace(/\s+/g, "_")            // espaço → _
    .replace(/[^a-zA-Z0-9_]/g, "")   // remove outros símbolos
    .replace(/_+/g, "_")             // evita múltiplos __
    .replace(/^_+|_+$/g, "")         // remove _ início/fim
    .toLowerCase();
}


export function colunsValidator(json_coluns, table_coluns) {
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

export async function dataFromBasesValidatorController(tabela, data_json) {
  try {
    const dataCol = await getDateColumnsFromTable(tabela); // ex: "dt_entrega"!
    console.log(`\x1b[36mColuna de data encontrada na tabela ${tabela}:\x1b[0m`, dataCol);

    if (!dataCol) return null;

    const primeiraLinha = data_json?.[0] || {};
    const chavesJson = Object.keys(primeiraLinha);

    const index = chavesJson.findIndex(
      (key) => normalizar(key) === normalizar(dataCol)
    );

    if (index === -1) {
      console.warn(`\x1b[33mColuna de data '${dataCol}' não encontrada no CSV.\x1b[0m`);
      return null;
    }

    return dataCol
    
  } catch (error) {
    console.error("Erro ao validar colunas de data:", error);
    return null;
  }
}