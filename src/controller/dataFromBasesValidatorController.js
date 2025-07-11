import { getDateColumnsFromTable } from "../model/tableModel.js"

export function normalizar(nome) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "_")             
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "")
    .toLowerCase();
}

export async function dataFromBasesValidatorController(tabela, data_json) {
  try {
    const dataCol = await getDateColumnsFromTable(tabela); // ex: "dt_entrega"
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