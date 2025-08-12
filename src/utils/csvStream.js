import crypto from "crypto";
import Papa from "papaparse";
import normalizar from "./normalizar.js";
import { sanitizeValue } from "./sanitizeValue.js"
import { addAviso, addInfo } from "../middleware/errorHandler.js";
import {
  getTiposFromTable,
  getColumnsFromTable,
  getDateColumnsFromTable,
} from "../model/tableModel.js";
import { detectEncoding, detectDelimiter, createDecodedStream } from "./prepareStreamByFilepath.js"


export async function analyzeCsv(filePath, tabelaName) {
  const contexto = filePath;

  // 1) Metadados de tabela
  const tiposEsperados = await getTiposFromTable(tabelaName);
  const colunasTabela = await getColumnsFromTable(tabelaName);
  const colunaDataEsperada = await getDateColumnsFromTable(tabelaName);

  // 2) Encoding + delimiter detectados
  const { encoding } = await detectEncoding(filePath);
  const delimiter = await detectDelimiter(filePath, encoding);

  // 3) Lê cabeçalho cru (primeira linha) e normaliza 1x
  const rawHeaders = await readCsvHeader(filePath, encoding, delimiter);
  const { headers: headersNorm, duplicates } = normalizeHeadersOnce(rawHeaders);
  if (duplicates.size) {
    addAviso(
      `[CSV] Cabeçalhos duplicados renomeados: ${[...duplicates].join(", ")}`,
      contexto
    );
  }

  // 4) Inicializa hash & coletores
  const datasCsv = new Set();
  const hash = crypto.createHash("sha256");
  let totalLinhas = 0;

  hash.update("[");

  // 5) Stream das linhas (header:false) + mapeamento manual
  const input = await createDecodedStream(filePath, encoding);
  const parser = Papa.parse(Papa.NODE_STREAM_INPUT, {
    header: false,
    delimiter,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  const stream = input.pipe(parser);

  for await (const rowArray of stream) {
    const rowArr = Array.isArray(rowArray) ? rowArray : rowArray?.data || [];
    const rowObj = {};
    for (let i = 0; i < headersNorm.length; i++) {
      rowObj[headersNorm[i]] = rowArr[i] ?? null;
    }

    // junta no hash
    if (totalLinhas > 0) hash.update(",");
    hash.update(JSON.stringify(rowObj));

    // coleta datas (se houver coluna data esperada)
    if (colunaDataEsperada && rowObj[colunaDataEsperada]) {
      const tipoBruto = tiposEsperados[colunaDataEsperada];
      const tipo =
        tipoBruto === "date" || tipoBruto === "datetime" ? tipoBruto : "date";
      const valorData = sanitizeValue(rowObj[colunaDataEsperada], tipo);
      if (
        typeof valorData === "string" &&
        /^\d{4}-\d{2}-\d{2}/.test(valorData)
      ) {
        datasCsv.add(valorData.slice(0, 10)); // YYYY-MM-DD
      }
    }

    totalLinhas++;
  }

  hash.update("]");

  // 6) Retorno
  addInfo(
    `[Json] - ${totalLinhas} linhas válidas extraídas de ${filePath}`,
    contexto
  );

  return {
    hash: hash.digest("hex"),
    colunas_json: headersNorm, // <- agora em sincronia com o insert
    tipos_esperados: tiposEsperados,
    colunas_tabela: colunasTabela,
    coluna_data:
      colunaDataEsperada && headersNorm.includes(colunaDataEsperada)
        ? colunaDataEsperada
        : null,
    datas_csv: Array.from(datasCsv),
    total_linhas: totalLinhas,
  };
}

export function streamCsvRows(filePath, headersNorm, encoding, delimiter) {
  async function* generator() {
    const input = await createDecodedStream(filePath, encoding);
    const parser = Papa.parse(Papa.NODE_STREAM_INPUT, {
      header: false,
      delimiter,
      skipEmptyLines: true,
      dynamicTyping: false,
    });
    const stream = input.pipe(parser);

    let isFirstRow = true; 
    for await (const rowArray of stream) {
      if (isFirstRow) { isFirstRow = false; continue; }

      const row = Array.isArray(rowArray) ? rowArray : rowArray?.data || [];
      const obj = {};
      for (let i = 0; i < headersNorm.length; i++) {
        const v = row[i];
        obj[headersNorm[i]] =
          typeof v === "string" ? v.trim() : (v ?? null);
      }
      yield obj;
    }
  }
  return generator();
}
export function normalizeHeadersOnce(rawHeaders) {
  const usados = {};
  const headers = [];
  const duplicates = new Set();

  for (const h of rawHeaders) {
    let header = (h ?? "").toString();
    header = normalizar(header)
      .replace(/[^\x20-\x7E]/g, "")
      .trim();
    if (header === "") header = "unnamed";

    if (!usados[header]) {
      usados[header] = 1;
      headers.push(header);
      continue;
    }
    // duplicado -> sufixa
    usados[header]++;
    duplicates.add(header);
    headers.push(`${header}_${usados[header]}`);
  }
  return { headers, duplicates };
}

export async function readCsvHeader(filePath, encoding, delimiter) {
  const input = await createDecodedStream(filePath, encoding);
  return new Promise((resolve, reject) => {
    const parser = Papa.parse(Papa.NODE_STREAM_INPUT, {
      header: false,
      delimiter,
      preview: 1,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (res) => resolve(res.data?.[0] ?? []),
      error: reject,
    });
    input.pipe(parser);
  });
}
