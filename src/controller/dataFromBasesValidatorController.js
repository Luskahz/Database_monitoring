import { getDateColumnsFromTable } from "../model/logModel.js";

export function normalizar(nome) {
  return nome
    .normalize("NFD")                    // remove acento
    .replace(/[\u0300-\u036f]/g, "")    // remove acento
    .replace(/\s+/g, "_")               // espaço → underline
    .replace(/[^\w]/g, "")              // remove tudo que não é letra/número/_
    .toLowerCase()
}


export async function dataFromBasesValidatorController(tabela, data_json) {
  try {
    const results = await getDateColumnsFromTable(tabela);
    console.log(`\x1b[36mColunas de data encontradas na tabela ${tabela}:\x1b[0m`, results);

    if (!results || results.length === 0) {
      return null
    }

    const primeiraLinha = data_json?.[0] || {};
    const dataColunas = results.map((col) => col.COLUMN_NAME);

    const colunasComIndex = dataColunas.map((colName) => {
      const chavesJson = Object.keys(primeiraLinha);
      const index = chavesJson.findIndex(
        (key) => normalizar(key) === normalizar(colName)
      );

      return { index, name: colName };
    });

    return colunasComIndex;
  } catch (error) {
    console.error("Erro ao validar colunas de data:", error);
    return null;
  }
}
