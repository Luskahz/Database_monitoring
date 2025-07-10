export async function getLogByFile(fileName, tabela) {
  const [result] = await db.query(
    `
    SELECT * FROM log_ingestao
    WHERE tabela_destino = ? AND nome_arquivo = ?
    ORDER BY data_upload DESC
  `,
    [tabela, fileName]
  );

  return result //retorna todas as linhas referente ao log daquele mes naquela tabela
}


export async function getAllHashesFromTable(tabela) {
  const [result] = await db.query(
    `
    SELECT hash_arquivo FROM log_ingestao
    WHERE tabela_destino = ?
  `,
    [tabela]
  );
  return result;
}

export async function insertLog(logData) {
  const {
    tabela_destino,
    nome_arquivo,
    ano,
    data_upload,
    hash_arquivo,
    sucesso,
    mensagem_erro,
  } = logData;

  await db.query(
    `
    INSERT INTO log_ingestao
      (tabela_destino, nome_arquivo, ano, data_upload, hash_arquivo, sucesso, mensagem_erro)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    [
      tabela_destino,
      nome_arquivo,
      ano,
      data_upload,
      hash_arquivo,
      sucesso,
      mensagem_erro,
    ]
  );
}