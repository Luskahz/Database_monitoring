import db, { schema } from "../../config/db.js";


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
export async function getLogByData(metadados) {
  const { tabela, nome_arquivo, ano } = metadados;
  try {
    const [result] = await db.query(
      `
    SELECT * FROM \`${schema}\`.log_ingestao
    WHERE tabela_destino = ?
     AND nome_arquivo = ?
     AND ano = ?
    ORDER BY data_upload DESC
  `,
      [tabela, nome_arquivo, ano]
    );
    return result;
  } catch (e) {
    throw new Error(
      `Erro ao puxar os logs referente ao mes requerido, erro: ${e.message}`
    );
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
export async function getAllHashesFromTable(metadados) {
  const { tabela } = metadados;
  try {
    const [result] = await db.query(
      `
      SELECT hash_arquivo FROM \`${schema}\`.log_ingestao
      WHERE tabela_destino = ?
      `,
      [tabela]
    );
    return result;
  } catch (e) {
    throw new Error(`Erro ao puxar os hashs da tabela no log_ingestao`);
  }
}

export async function insertLog(logData) {
  const {
    tabela_destino,
    nome_arquivo,
    ano,
    mes,
    coluna_data,
    data_upload,
    hash_arquivo,
    caminho_original,
    sucesso,
    mensagem_erro,
  } = logData;

  try {
    await db.query(
      `
    INSERT INTO \`${schema}\`.log_ingestao
      (tabela_destino, nome_arquivo, ano, mes, coluna_data, data_upload, hash_arquivo, sucesso, mensagem_erro)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
      [
        tabela_destino,
        nome_arquivo,
        ano,
        mes,
        coluna_data,
        data_upload,
        hash_arquivo,
        sucesso,
        mensagem_erro,
      ]
    );
  } catch (e) {
    throw new Error(
      `Erro ao inserir log na tabela de ingestaõ, erro: ${e.message}`
    );
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
export async function deleteLogByHash(logData) {
  const { hash_arquivo } = logData;
  try {
    return await db.query(
      `
    DELETE FROM \`${schema}\`.log_ingestao WHERE hash_arquivo = ?`,
      [hash_arquivo]
    );
  } catch (e) {
    throw new Error(
      `Erro ao deletar o log com base no hash, erro: ${e.message}`
    );
  }
}


