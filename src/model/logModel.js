import db, { schema } from "../../config/db.js";
import crypto from "crypto";

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
  const [result] = await db.query(
    `
    SELECT * FROM \`${schema}\`.log_ingestao
    WHERE tabela_destino = ? AND nome_arquivo = ? AND ano = ?
    ORDER BY data_upload DESC
  `,
    [metadados.tabela, metadados.nome_arquivo, metadados.ano]
  );

  return result; //retorna todas as linhas referente ao log daquele mes naquela tabela
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
  const [result] = await db.query(
    `
    SELECT hash_arquivo FROM \`${schema}\`.log_ingestao
    WHERE tabela_destino = ?
  `,
    [metadados.tabela]
  );
  return result;
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
    sucesso,
    mensagem_erro,
  } = logData;

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
export async function deleteHashInTable(logData) {
  return await db.query(
    `
    DELETE FROM \`${schema}\`.log_ingestao WHERE hash_arquivo = ?`,
    [logData.hash_arquivo]
  );
}

export function createHashByData(dataJson) {
  try {
    const hash = crypto
      .createHash("sha256")
      .update(JSON.stringify(dataJson))
      .digest("hex");
    return hash;
  } catch (error) {
    console.error(
      `Houve um erro ao gerar o hash do arquivo, erro: ${error.message}`
    );
  }
}
