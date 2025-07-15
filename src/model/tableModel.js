import db, { schema } from "../../config/db.js";
import { normalizar } from "../controller/dataFromBasesValidatorController.js";
import { addErro } from "../middleware/errorHandler.js";

const meses = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

export async function getAllRegistersFromTable(tabela) {
  try {
    const [result] = await db.query(`
      SELECT * FROM \`${schema}\`.\`${tabela}\`
    `);
    return result;
  } catch (e) {
    addErro(
      `Erro ao consultar os registros da tabela destino, erro: ${e.message} `
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

    if (results.length === 0) {
      return null; // Retorna null se não houver colunas de data
    } else {
      return results[0].COLUMN_NAME; // Retorna o nome da primeira coluna
    }
  } catch (e) {
    addErro(`Erro ao consultar colunas de data: ${e.message}`);
  }
}

export async function getColunsFromTable(tabela) {
  try {
    const [results] = await db.query(
      `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = ?
        AND TABLE_SCHEMA = ?
    `,
      [tabela, schema]
    );

    return results.map((col) => col.COLUMN_NAME);
  } catch (e) {
    addErro(`Erro ao consultar colunas da tabela: ${e.message}`);
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
export async function insertRegisterinTable(tabela, linhaTipada) {
  let colunas;
  try {
    colunas = await getColunsFromTable(tabela);
  } catch (e) {
    addErro(`erro ao coletar as colunas da tabela, erro: ${e.message}`);
    return;
  }
  if (!colunas || colunas.length === 0) {
    addErro(`Tabela '${tabela}' não possui colunas válidas.`);
    return;
  }

  const valores = colunas.map((col) => {
    const chaveNormalizada = normalizar(col);
    return linhaTipada[chaveNormalizada] ?? null;
  });
  const colunasSql = colunas.map((col) => `\`${col}\``).join(", ");
  const placeholders = colunas.map(() => "?").join(", ");
  const sql = `INSERT INTO \`${schema}\`.\`${tabela}\` (${colunasSql}) VALUES (${placeholders})`;

  try {
    const [result] = await db.query(sql, valores);
    return result;
  } catch (e) {
    addErro(
      `erro ao realizar a query de insersão do registro, erro: ${e.message}`
    );
    return;
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
  const { coluna_data, tabela } = metadados;

  if (!coluna_data) {
    throw new Error("Coluna de data não especificada");
  }

  const query = `SELECT \`${coluna_data}\` FROM \`${schema}\`.\`${tabela}\``;

  try {
    const [result] = await db.query(query);
    return result || [];
  } catch (error) {
    // Aqui você apenas relança — quem chama decide o que fazer
    throw new Error(
      `Erro ao buscar período da tabela '${tabela}': ${error.message}`
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
export async function deletePeriodInTable(metadados) {
  const { mes, ano, tabela, coluna_data } = metadados;

  const numeroMes = meses[mes.toLowerCase()];
  if (!numeroMes) {
    throw new Error(`Mês inválido: ${mes}`);
  }

  const sql = `
    DELETE FROM \`${schema}\`.\`${tabela}\`
    WHERE MONTH(\`${coluna_data}\`) = ?
      AND YEAR(\`${coluna_data}\`) = ?
  `;

  try {
    const [result] = await db.query(sql, [numeroMes, ano]);
    return result;
  } catch (error) {
    throw new Error(
      `Erro ao deletar período de ${mes}/${ano} na tabela '${tabela}': ${error.message}`
    );
  }
}

export async function deletePeriodInTableByMonth(logData) {
  const { mes, ano, tabela_destino, coluna_data } = logData;

  const numeroMes = meses[mes.toLowerCase()];
  if (!numeroMes) {
    throw new Error(`Mês inválido: ${mes}`);
  }

  const sql = `
    DELETE FROM \`${schema}\`.\`${tabela_destino}\`
    WHERE MONTH(\`${coluna_data}\`) = ?
      AND YEAR(\`${coluna_data}\`) = ?
  `;

  try {
    const [result] = await db.query(sql, [numeroMes, ano]);
    return result;
  } catch (error) {
    throw new Error(
      `Erro ao deletar período ${mes}/${ano} da tabela '${tabela_destino}': ${error.message}`
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
export function insertValidator(list, metadados) {
  try {
    const datasBanco = new Set(
      list
        .map((d, i) => {
          const raw = d[metadados.coluna_data];
          const date = new Date(raw);
          if (isNaN(date)) {
            console.warn(`Valor inválido no banco na linha ${i}:`, raw);
            return null;
          }
          return date.toISOString().split("T")[0];
        })
        .filter(Boolean)
    );

    const datasCsv = new Set(
      metadados.data_json
        .map((linha, i) => {
          const raw = linha[metadados.coluna_data];
          const date = new Date(raw);
          if (isNaN(date)) {
            console.warn(`Valor inválido no CSV na linha ${i}:`, raw);
            return null;
          }
          return date.toISOString().split("T")[0];
        })
        .filter(Boolean)
    );

    const conflito = [...datasCsv].some((data) => datasBanco.has(data));

    if (conflito) {
      console.log(
        "Conflito de datas detectado. Dados do mês já existem no banco."
      );
      return "substituir";
    } else {
      return "inserir";
    }
  } catch (error) {
    console.error("Erro ao validar datas para inserção:", error);
    throw error;
  }
}

export async function getTiposFromTable(tabela) {
  try {
    const [results] = await db.query(
      `
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = ?
      AND TABLE_SCHEMA = ?
    `,
      [tabela, schema]
    );

    const tipos = {};
    results.forEach(({ COLUMN_NAME, DATA_TYPE }) => {
      tipos[normalizar(COLUMN_NAME)] = mapearTipo(DATA_TYPE);
    });

    return tipos;
  } catch (error) {
    console.error("Erro ao consultar tipos da tabela:", error);
    throw error;
  }
}

function mapearTipo(tipoSql) {
  if (["int", "bigint", "smallint", "mediumint"].includes(tipoSql))
    return "int";
  if (["decimal", "float", "double"].includes(tipoSql)) return "decimal";
  if (["date"].includes(tipoSql)) return "date";
  if (["time"].includes(tipoSql)) return "time";
  return "string";
}
