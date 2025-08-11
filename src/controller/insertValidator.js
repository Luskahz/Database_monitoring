import { addAviso } from "../middleware/errorHandler.js";
import {
  getLoggerContext,
  updateLoggerController,
} from "../middleware/logger.js";
/**
 *
 * @param {Array} list
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
 *    datas_csv: Array<string>,
 *    caminho_original: string,
 * }} metadados
 */
export async function insertValidator(list, metadados) {
  const contexto = metadados.caminho_original;
  if (list === null) {
    return "cadastro";
  } else {
    const { coluna_data, datas_csv } = metadados;
    if (!Array.isArray(datas_csv) || datas_csv.length === 0) {
      addAviso(
        "[Controller insersão] CSV sem dados válidos para coluna de data.",
        contexto
      );
      await updateLoggerController(
        getLoggerContext(metadados, {}, contexto),
        contexto
      );
      return null;
    }
    try {
      const datasBanco = extrairDatasValidas(
        list,
        coluna_data,
        "Banco",
        contexto
      );
      const conflito = datas_csv.some((data) => datasBanco.has(data));

      if (conflito) {
        addAviso(
          "[Controller insersão] Conflito detectado: datas do CSV já existem na base. Os dados serão reprocessados.",
          contexto
        );
        await updateLoggerController(metadados, contexto);
        return "substituir";
      }
      return "inserir";
    } catch (e) {
      throw new Error(
        `[Controller insersão] Erro ao validar datas para inserção, Erro: ${e.message}`
      );
    }
  }
}

function extrairDatasValidas(array, coluna, csvOrDataBase = "CSV", contexto) {
  return new Set(
    array
      .map((linha, i) => {
        const raw = linha[coluna];
        const date = new Date(raw);
        if (isNaN(date)) {
          addAviso(
            `[Controller insersão] Linha ${i}: valor inválido em '${coluna}' → '${raw}'. Registro ignorado [${csvOrDataBase}].`,
            contexto
          );
          return null;
        }
        return date.toISOString().split("T")[0];
      })
      .filter(Boolean)
  );
}
