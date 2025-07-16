import { addAviso, addErro } from "../middleware/errorHandler.js";
import { getDateColumnsFromTable } from "../model/tableModel.js";
import normalizar from "../utils/normalizar.js";

export async function dataFromBasesValidatorController(tabela, data_json) {
  try {
    const dataCol = await getDateColumnsFromTable(tabela);
    if (!dataCol) return null;

    const primeiraLinha = data_json?.[0] || {};
    const chavesJson = Object.keys(primeiraLinha);

    const index = chavesJson.findIndex(
      (key) => normalizar(key) === normalizar(dataCol)
    );

    if (index === -1) {
      addAviso(`Coluna de data '${dataCol}' não encontrada no CSV.`);
      return null;
    }

    return dataCol;
  } catch (e) {
    addErro(`Erro ao extrair coluna data, erro: ${e.message}`);
    throw e;
  }
}

/**
 * @param {{
 *    nome_arquivo: string,
 *    ano: number,
 *    mes: string,
 *    tabela: string,
 *    data_json: object
 *    coluna_data: string,
 *    acao: string,
 *    colunas_tabela: object
 *    colunas_json: object
 * }} metadados
 */
export function insertValidator(list, metadados) {
  const { coluna_data, data_json } = metadados;
  if (!Array.isArray(data_json) || data_json.length === 0) {
    addAviso(
      "JSON de dados está vazio. Nenhuma validação de coluna de data será feita."
    );
    return null;
  }
  try {
    const datasBanco = extrairDatasValidas(
      list,
      coluna_data,
      "Banco"
    );
    const datasCsv = extrairDatasValidas(
      data_json,
      coluna_data,
      "CSV"
    );
    const conflito = [...datasCsv].some((data) => datasBanco.has(data));

    return conflito
      ? (addAviso(
          "Conflito detectado: datas do CSV já existem na base. Os dados serão reprocessados."
        ),
        "substituir")
      : "inserir";
  } catch (e) {
    addErro(`Erro ao validar datas para inserção, Erro: ${e.message}`);
    throw e;
  }
}

function extrairDatasValidas(array, coluna, contexto = "CSV") {
  return new Set(
    array
      .map((linha, i) => {
        const raw = linha[coluna];
        const date = new Date(raw);
        if (isNaN(date)) {
          addAviso(
            `Linha ${i}: valor inválido em '${coluna}' → '${raw}'. Registro ignorado [${contexto}].`
          );
          return null;
        }
        return date.toISOString().split("T")[0];
      })
      .filter(Boolean)
  );
}
