import db, { schema } from "../../config/db.js";
import mapearTipo from "../utils/mapearTipos.js";

/* -------------------- Caches de metadados -------------------- */
const schemaCache = new Map();
const columnsCache = new Map();
const tiposCache = new Map();
const dateColCache = new Map();

/* -------------------- Mapa de meses -------------------- */
const meses = {
  janeiro: 1, jan: 1, "jan.": 1,
  fevereiro: 2, fev: 2, "fev.": 2,
  marco: 3, março: 3, mar: 3, "mar.": 3,
  abril: 4, abr: 4, "abr.": 4,
  maio: 5, mai: 5, "mai.": 5,
  junho: 6, jun: 6, "jun.": 6,
  julho: 7, jul: 7, "jul.": 7,
  agosto: 8, ago: 8, "ago.": 8,
  setembro: 9, set: 9, "set.": 9,
  outubro: 10, out: 10, "out.": 10,
  novembro: 11, nov: 11, "nov.": 11,
  dezembro: 12, dez: 12, "dez.": 12,
};

/* ========================= Helpers ========================= */

/** Converte "agosto"/"ago" em número do mês (1..12). */
function monthToNumber(m) {
  return meses[(m || "").toLowerCase()] || null;
}

/** Retorna [inicio, fimExclusivo] (YYYY-MM-DD) para filtros sargáveis por data. */
function computeDateRange({ ano, mes, dia }) {
  const y = Number(ano);
  if (!y || !mes) return null;

  const m = monthToNumber(mes);
  if (!m) return null;

  if (dia != null && dia !== undefined && dia !== "") {
    const d = Number(dia);
    if (!d) return null;
    const inicio = new Date(Date.UTC(y, m - 1, d));
    const fim = new Date(Date.UTC(y, m - 1, d + 1));
    const i = inicio.toISOString().slice(0, 10);
    const f = fim.toISOString().slice(0, 10);
    return [i, f];
  }

  // mês inteiro
  const inicio = new Date(Date.UTC(y, m - 1, 1));
  const fim = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));
  const i = inicio.toISOString().slice(0, 10);
  const f = fim.toISOString().slice(0, 10);
  return [i, f];
}

/** Gera "(?, ?, ...)" repetido N vezes e o array achatado de valores. */
function buildMultiValuesPlaceholders(rows, cols) {
  const perRow = `(${cols.map(() => "?").join(",")})`;
  const placeholders = new Array(rows.length);
  const flat = new Array(rows.length * cols.length);
  let k = 0;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    placeholders[r] = perRow;
    for (let c = 0; c < cols.length; c++) {
      flat[k++] = row[cols[c]] ?? null;
    }
  }
  return { placeholders: placeholders.join(","), flat };
}

/* ========================= Models ========================= */

export async function getAllRegistersFromTable(tabela) {
  try {
    const [result] = await db.query(`SELECT * FROM \`${schema}\`.\`${tabela}\``);
    return result;
  } catch (e) {
    throw new Error(
      `[Model registers] Erro ao consultar os registros da tabela destino, erro: ${e.message} `
    );
  }
}

export async function getDateColumnsFromTable(tabela) {
  const key = `${schema}.${tabela}`;
  if (dateColCache.has(key)) return dateColCache.get(key);
  try {
    const [results] = await db.query(
      `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = ?
        AND TABLE_SCHEMA = ?
        AND DATA_TYPE = 'date'
    `,
      [tabela, schema]
    );
    const col = results.length > 0 ? results[0].COLUMN_NAME : null;
    dateColCache.set(key, col);
    return col;
  } catch (e) {
    throw new Error(
      `[Model dataColun] Erro ao consultar colunas de data: ${e.message}`
    );
  }
}

export async function getColumnsFromTable(tabela) {
  const key = `${schema}.${tabela}`;
  if (columnsCache.has(key)) return columnsCache.get(key);
  try {
    const [results] = await db.query(
      `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = ?
        AND TABLE_SCHEMA = ?
        ORDER BY ORDINAL_POSITION
    `,
      [tabela, schema]
    );
    const cols = results.map((col) => col.COLUMN_NAME);
    columnsCache.set(key, cols);
    return cols;
  } catch (e) {
    throw new Error(
      `[model consultar colunas] Erro ao consultar colunas da tabela: ${e.message}`
    );
  }
}

/**
 * Insere/Upserta 1 linha.
 */
export async function insertRegisterinTable(tabela, linhaTipada, colunas) {
  let cols = colunas;
  if (!cols) {
    try {
      cols = await getColumnsFromTable(tabela);
    } catch (e) {
      throw new Error(
        `[model coleta de tipagem para insert] erro ao coletar as colunas da tabela, erro: ${e.message}`
      );
    }
  }
  if (!cols || cols.length === 0) {
    throw new Error(
      `[model coleta de tipagem para insert] Tabela '${tabela}' não possui colunas válidas.`
    );
  }

  const valores = cols.map((col) => linhaTipada[col] ?? null);
  const colunasSql = cols.map((col) => `\`${col}\``).join(", ");
  const placeholders = `(${cols.map(() => "?").join(",")})`;

  const updateClause = cols.map((col) => `\`${col}\` = VALUES(\`${col}\`)`).join(", ");

  const sql = `
    INSERT INTO \`${schema}\`.\`${tabela}\` (${colunasSql})
    VALUES ${placeholders}
    ON DUPLICATE KEY UPDATE ${updateClause}
  `;

  try {
    const [result] = await db.query(sql, valores);
    return { result, linhaTipada };
  } catch (e) {
    throw new Error(
      `[model insert] erro ao realizar a query de insersão do registro, erro: ${e.message}`
    );
  }
}

/**
 * Retorna as datas do período (só a coluna de data), usando consulta sargável.
 */
export async function listPeriodInTable(metadados) {
  const { coluna_data, tabela, dia, mes, ano } = metadados;
  if (!coluna_data) return null;

  // Se não passou ano/mes, segue comportamento anterior (full table) — mas evite em produção.
  if (!ano || !mes) {
    try {
      const [res] = await db.query(
        `SELECT \`${coluna_data}\` FROM \`${schema}\`.\`${tabela}\``
      );
      return res || [];
    } catch (error) {
      throw new Error(
        `[model periodo] Erro ao buscar período da tabela, erro: ${error.message}`
      );
    }
  }

  const range = computeDateRange({ ano, mes, dia });
  if (!range) {
    throw new Error(`[model periodo] Mês/Dia/Ano inválido(s)`);
  }
  const [inicio, fim] = range;

  const sql = `
    SELECT \`${coluna_data}\`
    FROM \`${schema}\`.\`${tabela}\`
    WHERE \`${coluna_data}\` >= ? AND \`${coluna_data}\` < ?
  `;
  try {
    const [result] = await db.query(sql, [inicio, fim]);
    return result || [];
  } catch (error) {
    throw new Error(
      `[model periodo] Erro ao buscar período da tabela, erro: ${error.message}`
    );
  }
}

/**
 * Deleta por período usando range sargável; opcionalmente em chunks para reduzir lock.
 */
export async function deleteFromTable(opcoes) {
  const { tabela, tabela_destino, mes, ano, dia, coluna_data } = opcoes;
  const nomeTabela = tabela || tabela_destino;

  if (!nomeTabela) {
    throw new Error("[model delete] Nome da tabela não foi informado.");
  }

  // Sem coluna_data: mantém comportamento antigo (full delete) — cuidado!
  if (!coluna_data) {
    const sql = `DELETE FROM \`${schema}\`.\`${nomeTabela}\``;
    try {
      const [result] = await db.query(sql);
      return result;
    } catch (e) {
      throw new Error(
        `[model delete] Erro ao deletar dados da tabela '${nomeTabela}': ${e.message}`
      );
    }
  }

  const range = (ano && mes) ? computeDateRange({ ano, mes, dia }) : null;
  if (!range) {
    throw new Error(`[model delete] Mês/Ano inválidos para delete.`);
  }
  const [inicio, fim] = range;

  // Delete sargável; se volume grande, apagar em chunks para reduzir locks longos.
  const CHUNK = 50_000; // ajuste fino
  let totalAff = 0;

  // Tenta chunked delete (ORDER BY coluna_data usa índice)
  try {
    // Se o servidor não suportar DELETE ... ORDER BY ... LIMIT, caímos no full delete
    while (true) {
      const sql = `
        DELETE FROM \`${schema}\`.\`${nomeTabela}\`
        WHERE \`${coluna_data}\` >= ? AND \`${coluna_data}\` < ?
        ORDER BY \`${coluna_data}\`
        LIMIT ${CHUNK}
      `;
      const [res] = await db.query(sql, [inicio, fim]);
      const aff = res?.affectedRows || 0;
      totalAff += aff;
      if (aff < CHUNK) break; // esvaziou o range
    }
    return { affectedRows: totalAff };
  } catch {
    // Fallback: um único DELETE sargável (pode segurar lock maior)
    try {
      const sql = `
        DELETE FROM \`${schema}\`.\`${nomeTabela}\`
        WHERE \`${coluna_data}\` >= ? AND \`${coluna_data}\` < ?
      `;
      const [res] = await db.query(sql, [inicio, fim]);
      return res;
    } catch (e) {
      throw new Error(
        `[model delete] Erro ao deletar dados da tabela '${nomeTabela}': ${e.message}`
      );
    }
  }
}

export async function getTiposFromTable(tabela) {
  const key = `${schema}.${tabela}`;
  if (tiposCache.has(key)) return tiposCache.get(key);

  let results;
  try {
    [results] = await db.query(
      `
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = ?
        AND TABLE_SCHEMA = ?
    `,
      [tabela, schema]
    );
  } catch (e) {
    throw new Error(
      `[model tipagem] Erro ao consultar tipos de colunas da tabela '${tabela}', erro: ${e.message}`
    );
  }

  if (!results || results.length === 0) {
    throw new Error(
      `[model tipagem] Nenhuma coluna encontrada para a tabela '${tabela}'`
    );
  }

  const tipos = {};
  for (const { COLUMN_NAME, DATA_TYPE } of results) {
    tipos[COLUMN_NAME] = mapearTipo(DATA_TYPE);
  }
  tiposCache.set(key, tipos);
  return tipos;
}

/**
 * Insere múltiplas linhas num único INSERT multi-VALUES, com ON DUPLICATE KEY UPDATE.
 * Mantém a assinatura/retorno. Usa placeholders explícitos (robusto e rápido).
 */
export async function insertBatchInTable(tabela, linhasTipadas, colunas) {
  if (!linhasTipadas || linhasTipadas.length === 0) {
    return { result: null, linhasTipadas: [] };
  }

  let cols = colunas;
  if (!cols) {
    try {
      cols = await getColumnsFromTable(tabela);
    } catch (e) {
      throw new Error(
        `[model coleta de tipagem para insert] erro ao coletar as colunas da tabela, erro: ${e.message}`
      );
    }
  }
  if (!cols || cols.length === 0) {
    throw new Error(
      `[model coleta de tipagem para insert] Tabela '${tabela}' não possui colunas válidas.`
    );
  }

  const colunasSql = cols.map((col) => `\`${col}\``).join(", ");
  const updateClause = cols.map((col) => `\`${col}\` = VALUES(\`${col}\`)`).join(", ");

  // placeholders e valores achatados
  const { placeholders, flat } = buildMultiValuesPlaceholders(linhasTipadas, cols);

  const sql = `
    INSERT INTO \`${schema}\`.\`${tabela}\` (${colunasSql})
    VALUES ${placeholders}
    ON DUPLICATE KEY UPDATE ${updateClause}
  `;

  try {
    const [result] = await db.query(sql, flat);
    return { result, linhasTipadas };
  } catch (e) {
    throw new Error(
      `[model insert batch] erro ao realizar a query de insersão do lote, erro: ${e.message}`
    );
  }
}

/* ==================== Perfis decimais (já existia) ==================== */

export async function loadDecimalProfilesFromSchema(tableName) {
  const schemaName = schema;
  const key = `${schemaName}.${tableName}`;
  if (schemaCache.has(key)) return schemaCache.get(key);

  const sql = `
    SELECT COLUMN_NAME, DATA_TYPE, NUMERIC_SCALE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`;
  const [rows] = await db.query(sql, [schemaName, tableName]);

  const map = new Map();
  for (const r of rows) {
    const col = r.COLUMN_NAME;
    const t = String(r.DATA_TYPE).toLowerCase();
    const scale = r.NUMERIC_SCALE == null ? null : Number(r.NUMERIC_SCALE);

    if (t === "decimal" || t === "numeric") {
      if (scale != null && scale <= 2) {
        map.set(col, {
          type: "decimal",
          profile: "money",
          thousands: "allow",
          maxFracDigits: scale,
        });
      } else {
        map.set(col, {
          type: "decimal",
          profile: "quantity",
          thousands: "never",
          maxFracDigits: scale ?? 6,
        });
      }
    } else if (t === "double" || t === "float") {
      map.set(col, {
        type: "decimal",
        profile: "quantity",
        thousands: "never",
        maxFracDigits: 6,
      });
    }
  }
  schemaCache.set(key, map);
  return map;
}

// mescla tipos definidos por você (prioridade) com os inferidos do schema
export function expandTiposWithSchema(tipos, schemaMap) {
  const out = { ...(tipos ?? {}) };
  for (const [col, opts] of schemaMap.entries()) {
    const current = out[col];
    if (!current) {
      out[col] = opts;
    } else if (typeof current === "string" && current === "decimal") {
      out[col] = opts; // se você só disse "decimal", assume perfil inferido
    } // se já veio objeto {type:"decimal",...}, mantém (override manual)
  }
  return out;
}
