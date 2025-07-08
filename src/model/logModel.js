import db from "../../config/db.js";


export async function getLogByFile(fileName, tabela) {
  const [result] = await db.query(`
    SELECT * FROM log_ingestao
    WHERE tabela_destino = ? AND nome_arquivo = ?
    ORDER BY data_upload DESC
  `, [tabela, fileName]);

  return result; // ou array completo
} 

export async function getAllHashesFromTable(tabela) {
  const [result] = await db.query(`
    SELECT hash_arquivo FROM log_ingestao
    WHERE tabela_destino = ?
  `, [tabela]);
  return result;
}

export async function getAllRegistersFromTable(tabela){
  const [result] = await db.query(`
    SELECT * FROM ${tabela}`)
    return result;
}



export async function getDateColumnsFromTable(tabela) {
  try {
    const [results] = await db.query(`
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = ?
        AND DATA_TYPE IN ('date')
    `, [tabela]);

    return results;
  } catch (error) {
    console.error("Erro ao consultar colunas de data:", error);
    throw error;
  }
}

export async function insertLog(logData) {
  const {
    tabela_destino,
    nome_arquivo,
    ano,
    data_upload,
    hash_arquivo,
    sucesso,
    mensagem_erro
  } = logData;

  await db.query(`
    INSERT INTO log_ingestao
      (tabela_destino, nome_arquivo, ano, data_upload, hash_arquivo, sucesso, mensagem_erro)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    tabela_destino,
    nome_arquivo,
    ano,
    data_upload,
    hash_arquivo,
    sucesso,
    mensagem_erro
  ]);
}


export async function getColunsFromTable(tabela) {
  try{
    const [results] = await db.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = ?
    `, [tabela]);

    return results.map(col => col.COLUMN_NAME);
  }catch (error) {
    console.error("Erro ao consultar colunas da tabela:", error);
    throw error;
  }
}