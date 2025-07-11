import { normalizar } from "../controller/dataFromBasesValidatorController.js";
import db from "../../config/db.js";



/**
 * @param {{
 *    tabela: string
 * }} metadados
 * @returns {Promise<Object>} Mapeamento de colunas para tipos (string, int, date, decimal, etc.)
 */
export async function createSchemaFromTable(metadados) {
  try {
    const [results] = await db.query(
      `
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = ?
    `,
      [metadados.tabela]
    );

    const schema = {};
    for (const col of results) {
      const coluna = col.COLUMN_NAME;
      const tipo = col.DATA_TYPE.toLowerCase();

      // Mapear tipos SQL para tipos simplificados
      switch (tipo) {
        case "int":
        case "bigint":
        case "smallint":
        case "tinyint":
          schema[coluna] = "int";
          break;
        case "decimal":
        case "float":
        case "double":
        case "numeric":
          schema[coluna] = "float";
          break;
        case "date":
        case "datetime":
        case "timestamp":
          schema[coluna] = "date";
          break;
        case "time":
          schema[coluna] = "time";
          break;
        default:
          schema[coluna] = "string";
      }
    }

    return schema;
  } catch (error) {
    console.error("Erro ao criar schema da tabela:", error.message);
    throw error;
  }
}



export async function tiparLinha(linha, schema) {
  const novaLinha = {};
  for (const col in schema) {
    const valor = linha[col] ?? linha[normalizar(col)] ?? null;
    const tipo = schema[col];

    switch (tipo) {
      case "int":
        novaLinha[col] = parseInt(valor) || null;
        break;
      case "float":
      case "decimal":
        novaLinha[col] = parseFloat(valor?.toString().replace(",", ".")) || null;
        break;
      case "date":
        const data = new Date(valor);
        novaLinha[col] = isNaN(data) ? null : data.toISOString().split("T")[0];
        break;
      case "time":
        novaLinha[col] = valor?.match(/^\d{2}:\d{2}(:\d{2})?$/) ? valor : null;
        break;
      default:
        novaLinha[col] = valor || null;
    }
  }
  return novaLinha;
}

export function sanitizeValue(value, tipoEsperado) {
  if (value === "") return null;

  switch (tipoEsperado) {
    case "int":
      return parseInt(value.replace(/\./g, ""), 10);

    case "decimal":
      return parseFloat(value.replace(/\./g, "").replace(",", "."));

    case "date":
      // de dd/MM/yyyy para yyyy-MM-dd
      const [d, m, y] = value.split("/");
      return y && m && d ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : null;

    case "time":
      return value.length >= 5 ? value.slice(-5) : null;

    case "string":
    default:
      return value;
  }
}

export function sanitizeRow(row, tipos) {
  const novaLinha = {};
  for (const campo in row) {
    const tipo = tipos[campo] || "string";
    novaLinha[campo] = sanitizeValue(row[campo], tipo);
  }
  return novaLinha;
}
