import db, { schema } from "../../config/db.js";

import mapearTipo from "../utils/mapearTipos.js";

const schemaCache = new Map();

const meses = {
  janeiro: 1,
  jan: 1,
  "jan.": 1,

  fevereiro: 2,
  fev: 2,
  "fev.": 2,

  marco: 3,
  março: 3,
  mar: 3,
  "mar.": 3,

  abril: 4,
  abr: 4,
  "abr.": 4,

  maio: 5,
  mai: 5,
  "mai.": 5,

  junho: 6,
  jun: 6,
  "jun.": 6,

  julho: 7,
  jul: 7,
  "jul.": 7,

  agosto: 8,
  ago: 8,
  "ago.": 8,

  setembro: 9,
  set: 9,
  "set.": 9,

  outubro: 10,
  out: 10,
  "out.": 10,

  novembro: 11,
  nov: 11,
  "nov.": 11,

  dezembro: 12,
  dez: 12,
  "dez.": 12,
};

export async function getAllRegistersFromTable(tabela) {
  try {
    const [result] = await db.query(`
      SELECT * FROM \`${schema}\`.\`${tabela}\`
    `);
    return result;
  } catch (e) {
    throw new Error(
      `[Model registers] Erro ao consultar os registros da tabela destino, erro: ${e.message} `
    );
  }
}

export async function getDateColumnsFromTable(tabela) {
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

    return results.length > 0 ? results[0].COLUMN_NAME : null;
  } catch (e) {
    throw new Error(
      `[Model dataColun] Erro ao consultar colunas de data: ${e.message}`
    );
  }
}

export async function getColumnsFromTable(tabela) {
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

    return results.map((col) => col.COLUMN_NAME);
  } catch (e) {
    throw new Error(
      `[model consultar colunas] Erro ao consultar colunas da tabela: ${e.message}`
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
  const placeholders = cols.map(() => "?").join(", ");

  // Monta a cláusula para atualizar todos os campos, exceto PK
  const updateClause = cols
    .map((col) => `\`${col}\` = VALUES(\`${col}\`)`)
    .join(", ");

  const sql = `
    INSERT INTO \`${schema}\`.\`${tabela}\` (${colunasSql})
    VALUES (${placeholders})
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
export async function listPeriodInTable(metadados) {
  const { coluna_data, tabela, dia, mes, ano } = metadados;
  if (!coluna_data) return null;

  let query,
    params = [];

  if (dia) {
    // Converte nome do mês para número (ex: "julho" → 7)
    const numeroMes = meses[(mes || "").toLowerCase()];
    if (!numeroMes || !ano)
      throw new Error(`[model periodo] Mês ou ano inválido`);

    query = `SELECT \`${coluna_data}\` FROM \`${schema}\`.\`${tabela}\` 
             WHERE DAY(\`${coluna_data}\`) = ? AND MONTH(\`${coluna_data}\`) = ? AND YEAR(\`${coluna_data}\`) = ?`;
    params = [Number(dia), numeroMes, Number(ano)];
  } else {
    query = `SELECT \`${coluna_data}\` FROM \`${schema}\`.\`${tabela}\``;
  }

  try {
    const [result] = await db.query(query, params);
    return result || [];
  } catch (error) {
    throw new Error(
      `[model periodo] Erro ao buscar período da tabela, erro: ${error.message}`
    );
  }
}

export async function deleteFromTable(opcoes) {
  const { tabela, tabela_destino, mes, ano, dia, coluna_data } = opcoes;

  const nomeTabela = tabela || tabela_destino;

  if (!nomeTabela) {
    throw new Error("[model delete] Nome da tabela não foi informado.");
  }

  let sql,
    params = [];

  if (coluna_data && mes && ano) {
    const numeroMes = meses[(mes || "").toLowerCase()];
    if (!numeroMes) {
      throw new Error(
        `[model delete] Mês inválido: '${mes}' não está mapeado.`
      );
    }

    if (dia) {
      sql = `
        DELETE FROM \`${schema}\`.\`${nomeTabela}\`
        WHERE DAY(\`${coluna_data}\`) = ? AND MONTH(\`${coluna_data}\`) = ? AND YEAR(\`${coluna_data}\`) = ?
      `;
      params = [Number(dia), numeroMes, Number(ano)];
    } else {
      sql = `
        DELETE FROM \`${schema}\`.\`${nomeTabela}\`
        WHERE MONTH(\`${coluna_data}\`) = ? AND YEAR(\`${coluna_data}\`) = ?
      `;
      params = [numeroMes, Number(ano)];
    }
  } else {
    sql = `DELETE FROM \`${schema}\`.\`${nomeTabela}\``;
  }
  try {
    const [result] = await db.query(sql, params);
    return result;
  } catch (e) {
    throw new Error(
      `[model delete] Erro ao deletar dados da tabela '${nomeTabela}': ${e.message}`
    );
  }
}

export async function getTiposFromTable(tabela) {
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
  results.forEach(({ COLUMN_NAME, DATA_TYPE }) => {
    tipos[COLUMN_NAME] = mapearTipo(DATA_TYPE);
  });

  return tipos;
}

/**
 * Insere múltiplas linhas em um único comando INSERT.
 * @param {string} tabela
 * @param {Array<object>} linhasTipadas
 * @param {Array<string>} colunas
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

  // Monta valores para cada linha
  const valores = linhasTipadas.map((linha) =>
    cols.map((col) => linha[col] ?? null)
  );

  const colunasSql = cols.map((col) => `\`${col}\``).join(", ");

  // Gera cláusula de atualização automática
  const updateClause = cols
    .map((col) => `\`${col}\` = VALUES(\`${col}\`)`)
    .join(", ");

  const sql = `
    INSERT INTO \`${schema}\`.\`${tabela}\` (${colunasSql})
    VALUES ?
    ON DUPLICATE KEY UPDATE ${updateClause}
  `;

  try {
    const [result] = await db.query(sql, [valores]);
    return { result, linhasTipadas };
  } catch (e) {
    throw new Error(
      `[model insert batch] erro ao realizar a query de insersão do lote, erro: ${e.message}`
    );
  }
}

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
