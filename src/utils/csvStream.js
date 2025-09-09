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
import { performance } from "node:perf_hooks"; // <-- métricas de tempo

/* ───────────────────────── helpers de log/tempo ───────────────────────── */
function ms(x){ return `${x.toFixed(0)}ms`; }
function s(x){ return `${x.toFixed(2)}s`; }
function rate(lins, msElapsed){
  if (msElapsed <= 0) return "— lin/s";
  return `${(lins / (msElapsed/1000)).toFixed(0)} lin/s`;
}

/* ────────────────────────── tee p/ hash e parse ───────────────────────── */
export function createFileTee(filePath, { highWaterMark = 1024 * 1024 } = {}) {
  const src = createReadStream(filePath, { highWaterMark }); // bytes
  const a = new PassThrough({ highWaterMark });
  const b = new PassThrough({ highWaterMark });

  let paused = false;

  function writeBoth(chunk) {
    const okA = a.write(chunk);
    const okB = b.write(chunk);
    if (!okA || !okB) {
      if (!paused) { paused = true; src.pause(); }
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

/* ───────────────────────────── analyzeCsv ─────────────────────────────── */
export async function analyzeCsv(filePath, tabelaName) {
  const contexto = filePath;
  const T0 = performance.now();
  addInfo(`[Analyze] Início | arquivo="${filePath}" | tabela="${tabelaName}"`, contexto);

  /* 1) Metadados e encoding (em paralelo) */
  const tMeta0 = performance.now();
  const [tiposEsperados, colunasTabela, colunaDataEsperada, encRes] =
    await Promise.all([
      getTiposFromTable(tabelaName),
      getColumnsFromTable(tabelaName),
      getDateColumnsFromTable(tabelaName),
      detectEncoding(filePath, { headBytes: 64 * 1024, fallback: "latin1" }),
    ]);
  const tMeta1 = performance.now();
  const encoding = encRes.encoding;
  addInfo(
    `[Analyze] Metadados carregados em ${ms(tMeta1 - tMeta0)} | tipos=${Object.keys(tiposEsperados||{}).length} | colunasTabela=${(colunasTabela||[]).length} | encoding=${encoding}`,
    contexto
  );

  /* 2) Delimitador */
  const tDel0 = performance.now();
  const delimiter = await detectDelimiter(filePath, encoding, {
    minHeadBytes: 64 * 1024,
    maxHeadBytes: 1024 * 1024,
    head: encRes.head,
  });
  const tDel1 = performance.now();
  addInfo(`[Analyze] Delimitador detectado: "${delimiter}" em ${ms(tDel1 - tDel0)}`, contexto);

  /* 3) Headers */
  const tHdr0 = performance.now();
  const rawHeaders = await readCsvHeader(filePath, encoding, delimiter, {
    highWaterMark: 64 * 1024,
    fastMode: true
  });
  const tHdr1 = performance.now();
  addInfo(`[Analyze] Cabeçalhos lidos (${rawHeaders.length} colunas) em ${ms(tHdr1 - tHdr0)}`, contexto);

  const tNorm0 = performance.now();
  const { headers: headersNorm, duplicates } = normalizeHeadersOnce(rawHeaders);
  const tNorm1 = performance.now();
  if (duplicates.size) {
    addAviso(`[Analyze] Cabeçalhos duplicados renomeados: ${[...duplicates].join(", ")}`, contexto);
  }
  addInfo(`[Analyze] Headers normalizados (${headersNorm.length}) em ${ms(tNorm1 - tNorm0)}`, contexto);

  /* 4) Coluna de data (se houver) */
  const headersLen = headersNorm.length;
  const idxData = colunaDataEsperada ? headersNorm.indexOf(colunaDataEsperada) : -1;
  const tipoBruto = idxData >= 0 ? tiposEsperados[colunaDataEsperada] : undefined;
  const tipoData =
    tipoBruto === "date" || tipoBruto === "datetime" ? tipoBruto : "date";
  const datePrefixRe = /^\d{4}-\d{2}-\d{2}/;
  addInfo(
    `[Analyze] Coluna de data esperada="${colunaDataEsperada ?? '(nenhuma)'}" | idx=${idxData} | tipoData=${tipoData}`,
    contexto
  );

  /* 5) Tee p/ hash + parse */
  const tTee0 = performance.now();
  const { forHash, forParse } = createFileTee(filePath, { highWaterMark: 1024 * 1024 });
  const pHash = hashBytes(forHash); // começa já
  const tTee1 = performance.now();
  addInfo(`[Analyze] Tee aberto (hash + parse) em ${ms(tTee1 - tTee0)} | HWM=1MB`, contexto);

  /* 6) Parser e varredura */
  const input =
    encoding === "latin1"
      ? forParse.pipe(iconv.decodeStream("latin1"))
      : (forParse.setEncoding("utf8"), forParse);

  const parser = Papa.parse(Papa.NODE_STREAM_INPUT, {
    header: false,
    delimiter,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    bom: true,
  });
  const stream = input.pipe(parser);

  addInfo(`[Analyze] Varredura iniciada…`, contexto);

  const datasCsv = new Set();
  let totalLinhas = 0;
  let isFirstRow = true;

  // métricas de throughput
  let lastTick = performance.now();
  let lastCount = 0;

  for await (const rowArray of stream) {
    const rowArr = Array.isArray(rowArray) ? rowArray : rowArray?.data || [];
    if (isFirstRow) { isFirstRow = false; continue; }

    if (idxData >= 0) {
      const rawVal = rowArr[idxData];
      if (rawVal != null && rawVal !== "") {
        if (typeof rawVal === "string" && datePrefixRe.test(rawVal)) {
          datasCsv.add(rawVal.slice(0, 10));
        } else {
          const valorData = sanitizeValue(rawVal, tipoData);
          if (typeof valorData === "string" && datePrefixRe.test(valorData)) {
            datasCsv.add(valorData.slice(0, 10));
          }
        }
      }
    }
    totalLinhas++;

    // checkpoints leves: 1k e depois de 10k em 10k
    if (totalLinhas === 1000 || (totalLinhas % 10000 === 0)) {
      const now = performance.now();
      const deltaMs = now - lastTick;
      const deltaLin = totalLinhas - lastCount;
      addInfo(`[Analyze] Progresso: ${totalLinhas} linhas | ${rate(deltaLin, deltaMs)} | datas distintas=${datasCsv.size}`, contexto);
      lastTick = now;
      lastCount = totalLinhas;
    }
  }

  /* 7) Finalização/hashes */
  const hashHex = await pHash;
  const T1 = performance.now();

  addInfo(
    `[Analyze] Concluído | linhas=${totalLinhas} | datas_distintas=${datasCsv.size} | hash=${hashHex.slice(0, 12)}… | tempo_total=${s((T1 - T0)/1000*1000)}`,
    contexto
  );

  return {
    hash: hashHex,                 // SHA-256 dos BYTES do arquivo
    encoding,
    delimiter,
    colunas_json: headersNorm,
    tipos_esperados: tiposEsperados,
    colunas_tabela: colunasTabela,
    coluna_data: idxData >= 0 ? colunaDataEsperada : null,
    datas_csv: Array.from(datasCsv),
    total_linhas: totalLinhas,
  };
}

/* ───────────────────────────── readCsvHeader ───────────────────────────── */
export async function readCsvHeader(filePath, encoding, delimiter, opts = {}) {
  const { highWaterMark = 64 * 1024, fastMode = true } = opts;

  const t0 = performance.now();
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
      const t1 = performance.now();
      addInfo(`[Analyze] readCsvHeader concluído em ${ms(t1 - t0)} | delimiter="${delimiter}" | encoding=${encoding}`, filePath);
      fn(val);
    };

    parser.once("data", (row) => {
      const arr = Array.isArray(row) ? row : (row && row.data) || [];
      finalize(resolve, arr);
    });

    parser.once("error", (err) => finalize(reject, err));
    parser.once("end",   ()   => finalize(resolve, [])); // arquivo vazio

    addInfo(`[Analyze] readCsvHeader iniciando (preview=1, HWM=${highWaterMark})`, filePath);
    input.pipe(parser);
  });
}

/* ─────────────────────────── normalizeHeadersOnce ──────────────────────── */
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

/* ───────────────────────────── streamCsvRows ───────────────────────────── */
export function streamCsvRows(filePath, headersNorm, encoding, delimiter, opts = {}) {
  const { highWaterMark = 1024 * 1024 } = opts;
  const EMPTY_ARR = [];

  async function* generator() {
    const t0 = performance.now();
    addInfo(`[StreamRows] start (HWM=${highWaterMark})`, filePath);

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
    let count = 0, last = performance.now(), lastCount = 0;

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

      count++;
      if (count % 20000 === 0) {
        const now = performance.now();
        addInfo(`[StreamRows] ${count} linhas entregues | ${rate(count - lastCount, now - last)}`, filePath);
        last = now; lastCount = count;
      }
      yield obj;
    }

    const t1 = performance.now();
    addInfo(`[StreamRows] fim | linhas=${count} | tempo=${ms(t1 - t0)}`, filePath);
  }

  return generator();
}

/* ───────────────────────────────── helper ──────────────────────────────── */
function maybeTrim(s) {
  const len = s.length;
  if (len === 0) return s;
  const a = s.charCodeAt(0), b = s.charCodeAt(len - 1);
  if (a > 32 && b > 32) return s;
  return s.trim();
}
