import db, { schema } from "../../config/db.js";

/**
 * @param {{
 *    tabela: string
 * }} metadados
 * @returns {Promise<Object>} Mapeamento de colunas para tipos (string, int, date, decimal, etc.)
 */
export async function createSchemaFromTable(metadados) {
  const { tabela } = metadados;
  try {
    let results;
    [results] = await db.query(
      `
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = ?
      AND TABLE_SCHEMA = ?
    `,
      [tabela, schema]
    );
    const tipagem = {};
    for (const col of results) {
      const coluna = col.COLUMN_NAME;
      const tipo = col.DATA_TYPE.toLowerCase();

      // Mapear tipos SQL para tipos simplificados
      switch (tipo) {
        case "int":
        case "bigint":
        case "smallint":
        case "tinyint":
          tipagem[coluna] = "int";
          break;
        case "decimal":
        case "float":
        case "double":
        case "numeric":
          tipagem[coluna] = "float";
          break;
        case "date":
        case "datetime":
        case "timestamp":
          tipagem[coluna] = "date";
          break;
        case "time":
          tipagem[coluna] = "time";
          break;
        default:
          tipagem[coluna] = "string";
      }
    }
    return tipagem;
  } catch (e) {
    throw new Error(`[model schema] Erro ao criar tipagem da tabela: ${e.message}`);
  }
}






