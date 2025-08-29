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
// topo do arquivo (junto dos caches existentes)
const insertPiecesCache = new Map(); // key: `${schema}.${tabela}` -> { colunasSql, updateClause, cols }

// constroi e cacheia partes estáveis do INSERT p/ essa tabela
function getInsertPieces(tabela, cols) {
  const key = `${schema}.${tabela}`;
  let cached = insertPiecesCache.get(key);
  if (cached && cached.cols?.length === cols.length && cached.cols.every((c,i)=>c===cols[i])) {
    return cached;
  }
  const colunasSql   = cols.map((col) => `\`${col}\``).join(", ");
  const updateClause = cols.map((col) => `\`${col}\` = VALUES(\`${col}\`)`).join(", ");
  cached = { colunasSql, updateClause, cols: [...cols] };
  insertPiecesCache.set(key, cached);
  return cached;
}

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
  let cols = colunas || await getColumnsFromTable(tabela);
  if (!cols || cols.length === 0) {
    throw new Error(`[model coleta de tipagem para insert] Tabela '${tabela}' não possui colunas válidas.`);
  }

  const { colunasSql, updateClause } = getInsertPieces(tabela, cols);
  const valores = cols.map((col) => linhaTipada[col] ?? null);
  const placeholdersRow = `(${cols.map(() => "?").join(",")})`;

  const sql = `
    INSERT INTO \`${schema}\`.\`${tabela}\` (${colunasSql})
    VALUES ${placeholdersRow}
    ON DUPLICATE KEY UPDATE ${updateClause}
  `;

  try {
    const [result] = await db.query(sql, valores);
    return { result, linhaTipada };
  } catch (e) {
    throw new Error(`[model insert] erro ao realizar a query de inserção do registro, erro: ${e.message}`);
  }
}

export async function existsAnyCsvDateInTable(metadados, opts = {}) {
  const { tabela, coluna_data, datas_csv } = metadados;
  if (!tabela || !coluna_data) return null;

  const uniq = new Set();
  if (Array.isArray(datas_csv)) {
    for (let i = 0; i < datas_csv.length; i++) {
      const d = datas_csv[i];
      if (d && typeof d === "string" && d.length >= 10) uniq.add(d.slice(0, 10));
    }
  }
  const dates = Array.from(uniq);
  if (dates.length === 0) return false;

  // 1) pré-cheque rápido por range (usa índice de data)
  let min = dates[0], max = dates[0];
  for (let i = 1; i < dates.length; i++) {
    const d = dates[i];
    if (d < min) min = d;
    if (d > max) max = d;
  }
  // max exclusive (+1 dia)
  const maxPlus1 = new Date(max);
  maxPlus1.setUTCDate(maxPlus1.getUTCDate() + 1);
  const maxEx = maxPlus1.toISOString().slice(0,10);

  {
    const sqlRange = `
      SELECT 1
      FROM \`${schema}\`.\`${tabela}\`
      WHERE \`${coluna_data}\` >= ? AND \`${coluna_data}\` < ?
      LIMIT 1
    `;
    const [r] = await db.query(sqlRange, [min, maxEx]);
    if (r.length === 0) return false; // nada no intervalo => certeza de não haver interseção
  }

  // 2) confirmação exata via IN chunked (mantém corretude)
  const CHUNK = Number(opts.chunkSize) > 0 ? Number(opts.chunkSize) : 500;
  for (let i = 0; i < dates.length; i += CHUNK) {
    const part = dates.slice(i, i + CHUNK);
    const placeholders = part.map(() => "?").join(",");
    const sql = `
      SELECT 1
      FROM \`${schema}\`.\`${tabela}\`
      WHERE \`${coluna_data}\` IN (${placeholders})
      LIMIT 1
    `;
    const [rows] = await db.query(sql, part);
    if (rows.length > 0) return true;
  }
  return false;
}



export async function deleteFromTable(opcoes) {
  const { tabela, tabela_destino, mes, ano, dia, coluna_data, chunkSize } = opcoes;
  const nomeTabela = tabela || tabela_destino;

  if (!nomeTabela) {
    throw new Error("[model delete] Nome da tabela não foi informado.");
  }

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
  const CHUNK = Number(chunkSize) > 0 ? Number(chunkSize) : 50_000;
  let totalAff = 0;

  try {
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
/**
 * Insere múltiplas linhas num único INSERT multi-VALUES.
 * @param {string} tabela
 * @param {Array<object>} linhasTipadas
 * @param {Array<string>} colunas
 * @param {{ skipUpdateClause?: boolean }} opts  // <— NOVO (opcional)
 */
export async function insertBatchInTable(tabela, linhasTipadas, colunas, opts = {}) {
  if (!linhasTipadas || linhasTipadas.length === 0) {
    return { result: null, linhasTipadas: [] };
  }

  let cols = colunas || await getColumnsFromTable(tabela);
  if (!cols || cols.length === 0) {
    throw new Error(`[model coleta de tipagem para insert] Tabela '${tabela}' não possui colunas válidas.`);
  }

  const { colunasSql, updateClause } = getInsertPieces(tabela, cols);
  const { placeholders, flat } = buildMultiValuesPlaceholders(linhasTipadas, cols);

  // quando o fluxo já deletou o período (cadastro/substituir), dá pra omitir o UPDATE:
  const useUpdate = opts.skipUpdateClause ? false : true;

  const sql = `
    INSERT INTO \`${schema}\`.\`${tabela}\` (${colunasSql})
    VALUES ${placeholders}
    ${useUpdate ? `ON DUPLICATE KEY UPDATE ${updateClause}` : ``}
  `;

  try {
    const [result] = await db.query(sql, flat);
    return { result, linhasTipadas };
  } catch (e) {
    throw new Error(`[model insert batch] erro ao realizar a query de inserção do lote, erro: ${e.message}`);
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
      out[col] = opts; 
    } 
  }
  return out;
}
