import db from "../../config/db.js";

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
  const [result] = await db.query(`
    SELECT * FROM ${tabela}`);
  return result;
}

export async function getDateColumnsFromTable(tabela) {
  try {
    const [results] = await db.query(
      `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = ?
        AND DATA_TYPE = 'date'
    `,
      [tabela]
    );

    if (results.length === 0) {
      return null; // Retorna null se não houver colunas de data
    } else {
      return results[0].COLUMN_NAME; // Retorna o nome da primeira coluna
    }
  } catch (error) {
    console.error("Erro ao consultar colunas de data:", error);
    throw error;
  }
}

export async function getColunsFromTable(tabela) {
  try {
    const [results] = await db.query(
      `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = ?
    `,
      [tabela]
    );

    return results.map((col) => col.COLUMN_NAME);
  } catch (error) {
    console.error("Erro ao consultar colunas da tabela:", error);
    throw error;
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
export async function insertRegisterinTable(metadados, i) {
  try {
    const colunas = await getColunsFromTable(metadados.tabela);
    const valores = colunas.map((col) =>{
      const valor =  metadados.data_json[i][col];
      return valor === undefined ? null : valor
    })
    const colunasSql = colunas.map((col) => `\`${col}\``).join(", ");
    const placeholders = colunas.map(() => "?").join(", ");
    const sql = `INSERT INTO \`${metadados.tabela}\` (${colunasSql}) VALUES (${placeholders})`;
    const result = await db.query(sql, valores);
    return result;
  } catch (error) {
    throw error;
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
  if (!metadados.coluna_data) throw new Error("Coluna de data não especificada");

  try {
    const [result] = await db.query(
      `SELECT \`${metadados.coluna_data}\` FROM \`${metadados.tabela}\``
    );
    return result || [];
  } catch (error) {
    console.error("Erro ao listar datas:", error);
    throw error;
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
  try {
    const numeroMes = meses[metadados.mes.toLowerCase()];
    if (!numeroMes) {
      throw new Error(`Mês inválido: ${mes}`);
    }

    const sql = `
      DELETE FROM \`${metadados.tabela}\`
      WHERE MONTH(\`${metadados.coluna_data}\`) = ?
        AND YEAR(\`${metadados.coluna_data}\`) = ?
    `;

    const result = await db.query(sql, [numeroMes, metadados.ano]);
    console.log(`\x1b[33mPeríodo deletado: ${metadados.mes}/${metadados.ano} da tabela ${metadados.tabela}\x1b[0m`);
    return result;
  } catch (error) {
    console.error("Erro ao deletar período da tabela:", error.message);
    throw error;
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
export async function insertValidator(list, metadados) {
  try {
    const datasBanco = new Set(
      list.map((d) => new Date(d[metadados.coluna_data]).toISOString().split("T")[0]) // yyyy-mm-dd
    );

    const datasCsv = new Set(
      metadados.data_json.map(
        (linha) => new Date(linha[metadados.coluna_data]).toISOString().split("T")[0]
      )
    );

    // Verifica se há alguma data que bate do csv com as datas do banco
    const conflito = [...datasCsv].some((data) => datasBanco.has(data));

    if (conflito) {
      console.log( "Conflito de datas detectado. Dados do mês já existem no banco.");
      return "substituir";
    } else {
      return "inserir";
    }
  } catch (error) {
    console.error("Erro ao validar datas para inserção:", error);
    throw error;
  }
}
