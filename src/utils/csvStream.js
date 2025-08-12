import fs from "fs";
import crypto from "crypto";
import Papa from "papaparse";
import  normalizar from "./normalizar.js";
import sanitizeRow from "./sanitizeValue.js";
import { addAviso, addInfo } from "../middleware/errorHandler.js";
import {
  getTiposFromTable,
  getColumnsFromTable,
  getDateColumnsFromTable,
} from "../model/tableModel.js";

export async function analyzeCsv(filePath, tabelaName) {
  const contexto = filePath;
  const tiposEsperados = await getTiposFromTable(tabelaName);
  const colunasTabela = await getColumnsFromTable(tabelaName);
  const colunaDataEsperada = await getDateColumnsFromTable(tabelaName);

  const duplicates = new Set();
  const transformHeader = buildHeaderTransformer(contexto, duplicates);

  const datasCsv = new Set();
  const hash = crypto.createHash("sha256");
  hash.update("[");
  let first = true;
  let colunasJson = [];
  let totalLinhas = 0;

  return new Promise((resolve, reject) => {
    const parser = Papa.parse(Papa.NODE_STREAM_INPUT, {
      header: true,
      skipEmptyLines: true,
      transformHeader,
      transform: (v) => (typeof v === "string" ? v.trim() : v)
    });

    parser.on("data", (row) => {
      if (first) {
        colunasJson = Object.keys(row);
        if (duplicates.size > 0) {
          addAviso(
            `[Json] - Colunas duplicadas detectadas e renomeadas: ${[
              ...duplicates,
            ].join(", ")}`,
            contexto
          );
        }
        first = false;
      }
      const sanitized = sanitizeRow(row, tiposEsperados);
      const rowStr = JSON.stringify(sanitized);
      if (totalLinhas > 0) hash.update(",");
      hash.update(rowStr);
      if (colunaDataEsperada && sanitized[colunaDataEsperada]) {
        const d = new Date(sanitized[colunaDataEsperada]);
        if (!isNaN(d)) datasCsv.add(d.toISOString().split("T")[0]);
      }
      totalLinhas++;
    });

    parser.on("error", (err) => {
      reject(new Error(`[Json] - erro ao processar CSV: ${err.message}`));
    });

    parser.on("end", () => {
      hash.update("]");
      addInfo(
        `[Json] - ${totalLinhas} linhas válidas extraídas de ${filePath}`,
        contexto
      );
      resolve({
        hash: hash.digest("hex"),
        colunas_json: colunasJson,
        tipos_esperados: tiposEsperados,
        colunas_tabela: colunasTabela,
        coluna_data:
          colunaDataEsperada && colunasJson.includes(colunaDataEsperada)
            ? colunaDataEsperada
            : null,
        datas_csv: Array.from(datasCsv),
        total_linhas: totalLinhas,
      });
    });

    fs.createReadStream(filePath).pipe(parser);
  });
}

function buildHeaderTransformer(contexto, duplicatesRef) {
  const usados = {};
  const emitidos = new Set(); // headers já retornados “sem sufixo”
  return (h) => {
    if (!h) return "unnamed";
    let header = normalizar(h)
      .replace(/[^\x20-\x7E]/g, "")
      .trim();
    header = header === "" ? "unnamed" : header;

    if (!usados[header]) {
      usados[header] = 1;
      emitidos.add(header);
      return header; // primeira vez volta “limpo”
    }

    if (emitidos.has(header)) {
      // idempotência: não promover para _2 só por “segunda chamada fantasma”
      return header;
    }

    usados[header]++;
    duplicatesRef.add(header);
    return `${header}_${usados[header]}`;
  };
}

export function streamCsvRows(filePath, tiposEsperados) {
  async function* generator() {
    const transformHeader = buildHeaderTransformer(filePath, new Set());
    const parser = Papa.parse(Papa.NODE_STREAM_INPUT, {
      header: true,
      skipEmptyLines: true,
      transformHeader,
      transform: (v) => (typeof v === "string" ? v.trim() : v),
    });
    const stream = fs.createReadStream(filePath).pipe(parser);

    for await (const row of stream) {
      console.log(row)
      yield row;
    }
  }
  return generator();
}
