import crypto from "crypto";
import Papa from "papaparse";
import { addAviso, addInfo } from "../middleware/errorHandler.js";
import {
  getTiposFromTable,
  getColumnsFromTable,
  getDateColumnsFromTable,
} from "../model/tableModel.js";
import {
  detectEncoding,
  detectDelimiter,
  createDecodedStream,
} from "./prepareStreamByFilepath.js";
import normalizar from "./normalizar.js"
import { sanitizeValue } from "./sanitizeValue.js";
import iconv from "iconv-lite";
import { createReadStream } from "fs";
import { PassThrough } from "stream";


function createFileTee(filePath, { highWaterMark = 1024 * 1024 } = {}) {
  const src = createReadStream(filePath, { highWaterMark }); // bytes
  const a = new PassThrough({ highWaterMark });
  const b = new PassThrough({ highWaterMark });

  let paused = false;

  function writeBoth(chunk) {
    const okA = a.write(chunk);
    const okB = b.write(chunk);
    if (!okA || !okB) {
      if (!paused) { paused = true; src.pause(); }
      // retoma quando AMBOS drenarem
      if (!okA) a.once("drain", tryResume);
      if (!okB) b.once("drain", tryResume);
    }
  }
  function tryResume() {
    if (a.writableNeedDrain || b.writableNeedDrain) return;
    if (paused) { paused = false; src.resume(); }
  }

  src.on("data", writeBoth);
  src.on("end", () => { a.end(); b.end(); });
  src.on("error", (e) => { a.destroy(e); b.destroy(e); });

  const kill = (e) => { try { src.destroy(e); } catch {} };
  a.on("error", kill);
  b.on("error", kill);

  return { forHash: a, forParse: b, src };
}

function hashBytes(readable) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    readable.on("data", (chunk) => h.update(chunk));
    readable.once("error", reject);
    readable.once("end", () => resolve(h.digest("hex")));
  });
}

export async function analyzeCsv(filePath, tabelaName) {
  const contexto = filePath;
  addInfo(`[Analyze] Iniciando análise do arquivo ${filePath}`, contexto);

  const [tiposEsperados, colunasTabela, colunaDataEsperada, encRes] =
    await Promise.all([
      getTiposFromTable(tabelaName),
      getColumnsFromTable(tabelaName),
      getDateColumnsFromTable(tabelaName),
      detectEncoding(filePath, { headBytes: 64 * 1024, fallback: "latin1" }),
    ]);
  addInfo(`[Analyze] Encoding detectado: ${encRes.encoding}`, contexto);

  const delimiter = await detectDelimiter(filePath, encRes.encoding, {
    minHeadBytes: 64 * 1024,
    maxHeadBytes: 1024 * 1024,
    head: encRes.head,
  });
  addInfo(`[Analyze] Delimitador detectado: "${delimiter}"`, contexto);

  const rawHeaders = await readCsvHeader(filePath, encRes.encoding, delimiter, {
    highWaterMark: 64 * 1024,
    fastMode: true
  });
  addInfo(`[Analyze] Cabeçalhos lidos (${rawHeaders.length} colunas)`, contexto);

  const { headers: headersNorm, duplicates } = normalizeHeadersOnce(rawHeaders);
  if (duplicates.size) {
    addAviso(`[CSV] Cabeçalhos duplicados renomeados: ${[...duplicates].join(", ")}`, contexto);
  }

  // … resto da lógica …

  let totalLinhas = 0;
  let isFirstRow = true;
  for await (const rowArray of stream) {
    if (isFirstRow) { isFirstRow = false; continue; }
    totalLinhas++;

    if (totalLinhas % 10000 === 0) {
      addInfo(`[Analyze] ${totalLinhas} linhas processadas até agora...`, contexto);
    }
  }

  const hashHex = await pHash;
  addInfo(`[Analyze] Finalizado: ${totalLinhas} linhas válidas, hash ${hashHex}`, contexto);

  return {
    hash: hashHex,
    encoding: encRes.encoding,
    delimiter,
    colunas_json: headersNorm,
    tipos_esperados: tiposEsperados,
    colunas_tabela: colunasTabela,
    coluna_data: idxData >= 0 ? colunaDataEsperada : null,
    datas_csv: Array.from(datasCsv),
    total_linhas: totalLinhas,
  };
}


export async function readCsvHeader(filePath, encoding, delimiter, opts = {}) {
  const {
    highWaterMark = 64 * 1024, 
    fastMode = true,
  } = opts;

  const input = await createDecodedStream(filePath, encoding, { highWaterMark });

  return new Promise((resolve, reject) => {
    const parser = Papa.parse(Papa.NODE_STREAM_INPUT, {
      header: false,
      delimiter,
      preview: 1,                
      skipEmptyLines: "greedy",
      dynamicTyping: false,
      bom: true,
      fastMode,
    });

    let settled = false;
    const finalize = (fn, val) => {
      if (settled) return;
      settled = true;
      try { input.unpipe(parser); } catch {}
      try { input.destroy(); } catch {}
      try { parser.destroy?.(); } catch {}
      try { parser.end?.(); } catch {}
      fn(val);
    };

    parser.once("data", (row) => {
      const arr = Array.isArray(row) ? row : (row && row.data) || [];
      finalize(resolve, arr);
    });

    parser.once("error", (err) => finalize(reject, err));
    parser.once("end",   ()   => finalize(resolve, [])); // arquivo vazio

    input.pipe(parser);
  });
}

export function normalizeHeadersOnce(rawHeaders) {
  const n = rawHeaders.length;
  const usados = Object.create(null);   
  const headers = new Array(n);
  let duplicates = null;                

  for (let i = 0; i < n; i++) {
    let header = String(rawHeaders[i] ?? "");
    header = normalizar(header);
    header = maybeTrim(header);
    if (header === "") header = "unnamed";

    const seen = usados[header] | 0;   
    if (seen === 0) {
      usados[header] = 1;
      headers[i] = header;
    } else {
      const next = seen + 1;
      usados[header] = next;
      if (!duplicates) duplicates = new Set();
      duplicates.add(header);
      headers[i] = header + "_" + next;
    }
  }

  return { headers, duplicates: duplicates ?? new Set() };
}

export function streamCsvRows(filePath, headersNorm, encoding, delimiter, opts = {}) {
  const { highWaterMark = 1024 * 1024 } = opts; 
  const EMPTY_ARR = []; 

async function* generator() {
    const input = await createDecodedStream(filePath, encoding, { highWaterMark });
    const parser = Papa.parse(Papa.NODE_STREAM_INPUT, {
      header: false,
      delimiter,
      skipEmptyLines: "greedy",
      dynamicTyping: false,
    });
    const stream = input.pipe(parser);

    let isFirstRow = true;
    const headersLen = headersNorm.length;

    for await (const rowArray of stream) {
      if (isFirstRow) { isFirstRow = false; continue; }

      const row = Array.isArray(rowArray)
        ? rowArray
        : (rowArray && rowArray.data) || EMPTY_ARR;

      const obj = {};
      for (let i = 0; i < headersLen; i++) {
        const h = headersNorm[i];
        const v = row[i];
        if (v == null) {
          obj[h] = null;
        } else if (typeof v === "string") {
          obj[h] = maybeTrim(v);
        } else {
          obj[h] = v;
        }
      }
      yield obj;
    }
  }

  return generator();
}

//helper
  function maybeTrim(s) {
  const len = s.length;
  if (len === 0) return s;
  const a = s.charCodeAt(0), b = s.charCodeAt(len - 1);
  if (a > 32 && b > 32) return s;    
  return s.trim();
}




