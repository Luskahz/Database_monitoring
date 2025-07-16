import { addErro, addInfo } from "../middleware/errorHandler.js";
import { getLogByData, getAllHashesFromTable } from "../model/logModel.js";

/**
 * @param {{
 *   nome_arquivo: string,
 *   ano: number,
 *   mes: string,
 *   tabela: string,
 *   data_json: object
 *   coluna_data: string,
 *   acao: string,
 *   colunas_tabela: object
 *   colunas_json: object
 * }} metadados
 * @param {{
 *    tabela_destino: string
 *    nome_arquivo: string
 *    ano: int
 *    data_upload: date
 *    hash_arquivo: char64
 *    sucesso: boolean
 *    mensagem_erro: string
 * }} logData
 */
export default async function fluxoValidatorController(metadados, logData) {
  let logs = [];
  let allHashes = [];

  try {
    logs = await getLogByData(metadados);
  } catch (e) {
    addErro(`erro ao extrair os logs referentes a data, erro: ${e.message}`);
  }

  try {
    allHashes = await getAllHashesFromTable(metadados);
  } catch (e) {
    addErro(`Erro ao extrair os hashs dos logs referentes a essa data`);
  }

  const hashJaExiste = allHashes.some(
    (entry) => entry.hash_arquivo === logData.hash_arquivo
  );
  if (!logData.hash_arquivo) {
    addErro("Hash do arquivo não foi definido.");
  }

  if (hashJaExiste) {
    addInfo(
      `[ARQUIVO DUPLICADO] O conteúdo de ${metadados.nome_arquivo} já está presente na base.`
    );
    return "ignorar";
  } else if (!logs || logs.length === 0) {
    addInfo(`[NOVO ARQUIVO] ${metadados.nome_arquivo} será processado.`);
    return "inserir";
  } else {
    addInfo(
      `[ARQUIVO MODIFICADO] ${metadados.nome_arquivo} já existia, mas foi alterado. Reprocessando.`
    );
    return "reprocessar";
  }
}
