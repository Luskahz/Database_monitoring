import db, { schema } from "../../config/db.js";
import { truncarFilepath } from "../controller/createDataController.js";

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
      `[model puxar log banco] Erro ao puxar os logs referente ao mes requerido, erro: ${e.message}`
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
    throw new Error(
      `[model puxar hashs banco] Erro ao puxar os hashs da tabela no log_ingestao`
    );
  }
}

export async function insertLog(logData) {
  const {
    tabela_destino,
    nome_arquivo,
    ano,
    mes,
    dia,
    coluna_data,
    data_upload,
    hash_arquivo,
    sucesso,
    mensagem_erro,
    caminho_original,
  } = logData;

  try {
    await db.query(
      `
    INSERT INTO \`${schema}\`.log_ingestao
      (tabela_destino, nome_arquivo, ano, mes, dia, coluna_data, data_upload, hash_arquivo, sucesso, mensagem_erro, caminho)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
      [
        tabela_destino,
        nome_arquivo,
        ano,
        mes,
        dia,
        coluna_data,
        data_upload,
        hash_arquivo,
        sucesso,
        mensagem_erro,
        caminho_original,
      ]
    );
  } catch (e) {
    throw new Error(
      `[model inserir log banco] Erro ao inserir log na tabela de ingestão, erro: ${e.message}`
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
      `[model delete log do banco] Erro ao deletar o log com base no hash, erro: ${e.message}`
    );
  }
}

export async function getLogWithFilePath(filePath) {
  filePath = truncarFilepath(filePath);

  try {
    const [rows] = await db.query(
      `
      SELECT * 
      FROM \`${schema}\`.log_ingestao 
      WHERE caminho = ?
      `,
      [filePath]
    );

    if (rows.length === 0) {
      return null; // não achou nada
    }

    // retorna o primeiro log já como objeto JSON
    return {
      id: rows[0].id,
      tabela_destino: rows[0].tabela_destino,
      nome_arquivo: rows[0].nome_arquivo,
      ano: rows[0].ano,
      mes: rows[0].mes,
      dia: rows[0].dia,
      coluna_data: rows[0].coluna_data,
      data_upload: rows[0].data_upload,
      hash_arquivo: rows[0].hash_arquivo,
      caminho: rows[0].caminho,
      sucesso: rows[0].sucesso,
      mensagem_erro: rows[0].mensagem_erro,
    };
  } catch (e) {
    throw new Error(
      `[model get From banco] Erro ao encontrar log com base no caminho: ${e.message}`
    );
  }
}
