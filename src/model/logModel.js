import db from "../../config/db.js";


export async function getLogByFile(fileName, tabela) {
  const [result] = await db.query(`
    SELECT * FROM log_${tabela} WHERE nome_arquivo = ?
  `, [fileName]);

  return result; // ou array completo
}

export async function insertLog(logData, tabela) {
  const { nome_arquivo, data_upload, hash_arquivo, sucesso, mensagem_erro } = logData;

  await db.query(`
    INSERT INTO log_${tabela} (nome_arquivo, data_upload, hash_arquivo, sucesso, mensagem_erro)
    VALUES (?, ?, ?, ?, ?)
  `, [nome_arquivo, data_upload, hash_arquivo, sucesso, mensagem_erro]);
}