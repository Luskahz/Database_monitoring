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
      return null; // ✅ Retorna null se não houver colunas de data
    }

    return results[0].COLUMN_NAME; // ✅ Retorna o nome da primeira coluna
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

export async function insertRegisterinTable(line, tabela) {
  try {
    const colunas = await getColunsFromTable(tabela);
    const valores = colunas.map((col) => line[col]);
    const colunasSql = colunas.map((col) => `\`${col}\``).join(", ");
    const placeholders = colunas.map(() => "?").join(", ");
    const sql = `INSERT INTO \`${tabela}\` (${colunasSql}) VALUES (${placeholders})`;
    const result = await db.query(sql, valores);
    return result;
  } catch (error) {
    console.error("Erro ao inserir colunas da tabela:", error);
    throw error;
  }
}

export async function listPeriodoDispFromTable(metadados) {


  if (!coluna_data) throw new Error("Coluna de data não especificada");

  try {
    const [result] = await db.query(
      `SELECT \`${coluna_data}\` FROM \`${tabela}\``
    );
    return result || [];
  } catch (error) {
    console.error("Erro ao listar datas:", error);
    throw error;
  }
}

export async function deletePeriodoDispFromTable(tabela, colunaData, mes, ano) {
  try {
    const numeroMes = meses[mes.toLowerCase()];

    if (!numeroMes) {
      throw new Error(`Mês inválido: ${mes}`);
    }

    const sql = `
      DELETE FROM \`${tabela}\`
      WHERE MONTH(\`${colunaData}\`) = ?
        AND YEAR(\`${colunaData}\`) = ?
    `;

    const result = await db.query(sql, [numeroMes, ano]);
    console.log(
      `\x1b[33mPeríodo deletado: ${mes}/${ano} da tabela ${tabela}\x1b[0m`
    );
    return result;
  } catch (error) {
    console.error("Erro ao deletar período da tabela:", error.message);
    throw error;
  }
}

export async function insertValidator(list, dataJson, colunaData) {
  try {
    const datasBanco = new Set(
      list.map((d) => new Date(d[colunaData]).toISOString().split("T")[0]) // yyyy-mm-dd
    );

    const datasCsv = new Set(
      dataJson.map(
        (linha) => new Date(linha[colunaData]).toISOString().split("T")[0]
      )
    );

    // Verifica se há interseção
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
