import { query as dbQuery, execute as dbExecute, getPool } from "../../config/dbPool.js";
import { schema } from "../../config/index.js";
import { truncarFilepath } from "../controller/createDataController.js";

// -----------------------------------------------------
// infra de prepared statements (reutilizáveis)
// -----------------------------------------------------
const exec = dbExecute || dbQuery;
const prepared = new Map(); // name -> Promise<PreparedStatement>
const pool = await getPool();

function getStmt(name, sql) {
  if (!pool.prepare) return null;                     // driver sem prepare
  if (!prepared.has(name)) prepared.set(name, pool.prepare(sql));
  return prepared.get(name);                        // Promise
}

// -----------------------------------------------------
// 1) Logs por arquivo/ano (apenas o MAIS RECENTE) — mantém retorno array
// -----------------------------------------------------
const GET_LOG_BY_DATA_SQL = `
  SELECT id, tabela_destino, nome_arquivo, ano, mes, dia,
         coluna_data, data_upload, hash_arquivo, caminho, sucesso, mensagem_erro
  FROM \`${schema}\`.log_ingestao
  WHERE tabela_destino = ? AND nome_arquivo = ? AND ano = ?
  ORDER BY data_upload DESC
  LIMIT 1
`;

export async function getLogByData(metadados) {
  const { tabela, nome_arquivo, ano } = metadados;
  try {
    const stmt = getStmt("GET_LOG_BY_DATA", GET_LOG_BY_DATA_SQL);
    if (stmt) {
      const ps = await stmt;
      const [rows] = await ps.execute([tabela, nome_arquivo, ano]);
      return rows && rows.length ? rows : [];
    }
    const rows = await exec(GET_LOG_BY_DATA_SQL, [tabela, nome_arquivo, ano]);
    return rows || [];
  } catch (e) {
    throw new Error(
      `[model puxar log banco] Erro ao puxar os logs referente ao mês requerido: ${e.message}`
    );
  }
}

// -----------------------------------------------------
// 2) EXISTS(hash) — alternativa leve ao getAllHashesFromTable
// -----------------------------------------------------
const EXISTS_HASH_SQL = `
  SELECT 1
  FROM \`${schema}\`.log_ingestao
  WHERE tabela_destino = ? AND hash_arquivo = ?
  LIMIT 1
`;

export async function existsHashInLog(tabela_destino, hash_arquivo) {
  try {
    const stmt = getStmt("EXISTS_HASH", EXISTS_HASH_SQL);
    if (stmt) {
      const ps = await stmt;
      const [rows] = await ps.execute([tabela_destino, hash_arquivo]);
      return rows.length > 0;
    }
    const rows = await exec(EXISTS_HASH_SQL, [tabela_destino, hash_arquivo]);
    return rows.length > 0;
  } catch (e) {
    throw new Error(`[model exists hash] Falha ao checar hash no log: ${e.message}`);
  }
}

// -----------------------------------------------------
// 3) (LEGADO) TODOS os hashes — mantenho por compatibilidade
//     -> prefira usar existsHashInLog() no fluxo novo
// -----------------------------------------------------
const GET_HASHES_SQL = `
  SELECT hash_arquivo
  FROM \`${schema}\`.log_ingestao
  WHERE tabela_destino = ?
`;

export async function getAllHashesFromTable(metadados) {
  const { tabela } = metadados;
  try {
    const stmt = getStmt("GET_HASHES", GET_HASHES_SQL);
    if (stmt) {
      const ps = await stmt;
      const [rows] = await ps.execute([tabela]);
      return rows || [];
    }
    const rows = await exec(GET_HASHES_SQL, [tabela]);
    return rows || [];
  } catch (e) {
    throw new Error(`[model puxar hashs banco] Erro ao puxar os hashs: ${e.message}`);
  }
}

// -----------------------------------------------------
// 4) INSERT do log (prepared statement reaproveitado)
// -----------------------------------------------------
const INSERT_LOG_SQL = `
  INSERT INTO \`${schema}\`.log_ingestao
  (tabela_destino, nome_arquivo, ano, mes, dia, coluna_data, data_upload, hash_arquivo, file_size_bytes, total_linhas, sucesso, mensagem_erro, caminho)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export async function insertLog(logData) {
  const values = [
    logData.tabela_destino ?? null,
    logData.nome_arquivo ?? null,
    logData.ano != null ? Number(logData.ano) : null,
    logData.mes ?? null,
    logData.dia ?? null,
    logData.coluna_data ?? null,
    logData.data_upload ?? new Date(),
    logData.hash_arquivo ?? null,
    logData.file_size_bytes ?? null,
    logData.total_linhas != null ? Number(logData.total_linhas) : null,
    logData.sucesso ? 1 : 0,
    logData.mensagem_erro ?? null,
    logData.caminho_original ?? null,
  ];

  try {
    const stmt = getStmt("INSERT_LOG", INSERT_LOG_SQL);
    if (stmt) {
      const ps = await stmt;
      await ps.execute(values);
    } else {
      await exec(INSERT_LOG_SQL, values);
    }
  } catch (e) {
    throw new Error(
      `[model inserir log banco] Erro ao inserir log na tabela de ingestão: ${e.message}`
    );
  }
}

// -----------------------------------------------------
// 5) DELETE por hash (prepared)
// -----------------------------------------------------
const DELETE_BY_HASH_SQL = `
  DELETE FROM \`${schema}\`.log_ingestao
  WHERE hash_arquivo = ?
`;

export async function deleteLogByHash(logData) {
  const { hash_arquivo } = logData;
  try {
    const stmt = getStmt("DELETE_BY_HASH", DELETE_BY_HASH_SQL);
    if (stmt) {
      const ps = await stmt;
      await ps.execute([hash_arquivo]);
    } else {
      await exec(DELETE_BY_HASH_SQL, [hash_arquivo]);
    }
  } catch (e) {
    throw new Error(
      `[model delete log do banco] Erro ao deletar o log com base no hash: ${e.message}`
    );
  }
}

// -----------------------------------------------------
// 6) GET por caminho (prepared + LIMIT 1)
// -----------------------------------------------------
const GET_BY_PATH_SQL = `
  SELECT id, tabela_destino, nome_arquivo, ano, mes, dia,
         coluna_data, data_upload, hash_arquivo, caminho, sucesso, mensagem_erro
  FROM \`${schema}\`.log_ingestao
  WHERE caminho = ?
  ORDER BY id DESC
  LIMIT 1
`;

export async function getLogWithFilePath(filePath) {
  const pathTrunc = truncarFilepath(filePath);
  try {
    const stmt = getStmt("GET_BY_PATH", GET_BY_PATH_SQL);
    const params = [pathTrunc];

    if (stmt) {
      const ps = await stmt;
      const [rows] = await ps.execute(params);
      if (!rows || rows.length === 0) return null;
      return rows[0];
    }

    const rows = await exec(GET_BY_PATH_SQL, params);
    if (!rows || rows.length === 0) return null;
    return rows[0];
  } catch (e) {
    throw new Error(
      `[model get From banco] Erro ao encontrar log com base no caminho: ${e.message}`
    );
  }
}

// -----------------------------------------------------
// 7) Busca log por metadados básicos (tamanho + linhas)
// -----------------------------------------------------
const FIND_BY_META_SQL = `
  SELECT id
    FROM \`${schema}\`.log_ingestao
   WHERE tabela_destino = ?
     AND file_size_bytes <=> ?
     AND total_linhas <=> ?
   ORDER BY id DESC
   LIMIT 1
`;

export async function findLogByFileMeta({ tabela_destino, file_size_bytes, total_linhas }) {
  const params = [tabela_destino, file_size_bytes ?? null, total_linhas ?? null];
  try {
    const stmt = getStmt("FIND_BY_META", FIND_BY_META_SQL);
    if (stmt) {
      const ps = await stmt;
      const [rows] = await ps.execute(params);
      return rows && rows.length ? rows[0] : null;
    }
    const rows = await exec(FIND_BY_META_SQL, params);
    return rows && rows.length ? rows[0] : null;
  } catch (e) {
    throw new Error(`[model find log meta] Erro ao buscar log por metadados: ${e.message}`);
  }
}
