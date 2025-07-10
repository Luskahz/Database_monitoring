import { getDateColumnsFromTable } from "../model/tableModel.js";

export function normalizar(nome) {
  return nome
    .normalize("NFD") // remove acento
    .replace(/[\u0300-\u036f]/g, "") // remove acento
    .replace(/\s+/g, "_") // espaço → underline
    .replace(/[^\w]/g, "") // remove tudo que não é letra/número/_
    .toLowerCase();
}

export async function dataFromBasesValidatorController(tabela, data_json) {
  try {
    const dataCol = await getDateColumnsFromTable(tabela); // retorna a coluna data em string da tabela destino
    console.log(`\x1b[36mColuna de data encontrada na tabela ${tabela}:\x1b[0m`, dataCol);

    if (!dataCol) {
      return null;
    }
    
    const primeiraLinha = data_json?.[0] || {};

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
