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
export default async function fluxoValidatorController(metadados, logData, next) {
  try {
    //₢onsulta o model para validar os hashs que existem na tabela destino
    const logs = await getLogByData(metadados); //todas as linhas referente ao log desse arquivo
    const allHashes = await getAllHashesFromTable(metadados); // todos os hashs presentes na tabela
    const hashJaExiste = allHashes.some((entry) => entry.hash_arquivo === logData.hash_arquivo);
    if (!logData.hash_arquivo) {
      throw new Error("Hash do arquivo não foi definido.");
    }

    if (hashJaExiste) {
      console.log(`\x1b[33m[ARQUIVO DUPLICADO]\x1b[0m O conteúdo de ${metadados.nome_arquivo} já está presente na base.`);
      return "ignorar"; //esse arquivo já foi inserido, sem necessidade de uma nova inserção
    } else if (!logs || logs.length === 0){ //se não houverem logs referente a essa data
      console.log(`\x1b[32m[NOVO ARQUIVO]\x1b[0m ${metadados.nome_arquivo} será processado.`);
      return "inserir"; //inserir os dados independentemente
    } else{
      console.log(`\x1b[31m[ARQUIVO MODIFICADO]\x1b[0m ${metadados.nome_arquivo} já existia, mas foi alterado. Reprocessando.`);
      return "reprocessar"; //caso não cair em nem um dos dois ifs, ele entende que existem hashs, mas nem um semelhante ao que estamos tentando inserir, logo é uma atualização
    }
    
  } catch (error) {
    next(error);
  }
}
