import { createReadStream } from "fs";
import chardet from "chardet";
import iconv from "iconv-lite";
import { addInfo, addAviso } from "../middleware/errorHandler.js";
import { performance } from "node:perf_hooks";
import { readHeadOnce } from "./readHeadOnce.js";

/* ────────────────────────────────────────────────────────────────────────── */
/* 1) DETECTAR ENCODING (lendo apenas um pedaço do início)                    */
/* ────────────────────────────────────────────────────────────────────────── */
export async function detectEncoding(input, maybeOptions = {}) {
  const opts = maybeOptions && typeof maybeOptions === "object" ? maybeOptions : {};
  let filePath = typeof input === "string" ? input : undefined;
  let headBuf = Buffer.isBuffer(input) ? input : undefined;

  let sampleBytes = opts.headBytes ?? opts.sampleBytes ?? 64 * 1024;
  let fallback = typeof opts.fallback === "string" ? opts.fallback : "latin1";

  if (input && typeof input === "object" && !Buffer.isBuffer(input)) {
    if (typeof input.filePath === "string") filePath = input.filePath;
    if (Buffer.isBuffer(input.headBuf)) headBuf = input.headBuf;
    if (typeof input.sampleBytes === "number") sampleBytes = input.sampleBytes;
    if (typeof input.headBytes === "number") sampleBytes = input.headBytes;
    if (typeof input.fallback === "string") fallback = input.fallback;
  }

  if (Buffer.isBuffer(opts.headBuf) && !headBuf) headBuf = opts.headBuf;
  if (typeof opts.sampleBytes === "number") sampleBytes = opts.sampleBytes;
  if (typeof opts.headBytes === "number") sampleBytes = opts.headBytes;
  if (typeof opts.filePath === "string" && !filePath) filePath = opts.filePath;
  if (typeof opts.fallback === "string") fallback = opts.fallback;

  const logContext = filePath;
  const t0 = performance.now();
  addInfo(`[Analyze] detectEncoding/start headBytes=${sampleBytes}`, logContext);

  if (!headBuf && filePath) {
    const res = await readHeadOnce(filePath, sampleBytes).catch(() => null);
    headBuf = res?.headBuf ?? null;
  }

  const headBytes = headBuf ? headBuf.length : 0;
  addInfo(`[Analyze] detectEncoding/head bytes=${headBytes}`, logContext);

  const guess = headBuf ? chardet.detect(headBuf) : null;
  const s = (guess || "").toUpperCase();

  let encoding;
  if (s.includes("UTF-8")) encoding = "utf8";
  else if (
    s.includes("ISO-8859") ||
    s.includes("WINDOWS-1252") ||
    s.includes("CP1252") ||
    s.includes("WIN-1252")
  ) encoding = "latin1";
  else encoding = fallback;

  const t1 = performance.now();
  if (!guess) {
    addAviso(
      `[Analyze] detectEncoding/no-guess → fallback=${encoding} (${(t1 - t0).toFixed(0)}ms)`,
      logContext
    );
  } else {
    addInfo(
      `[Analyze] detectEncoding/chardet="${s}" → ${encoding} (${(t1 - t0).toFixed(0)}ms)`,
      logContext
    );
  }

  return { encoding, head: headBuf };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 2) CRIAR STREAM DECODIFICADO COM highWaterMark AJUSTÁVEL                   */
/* ────────────────────────────────────────────────────────────────────────── */
export async function createDecodedStream(
  filePath,
  encoding /* 'utf8' | 'latin1' */,
  { highWaterMark = 1024 * 1024, start, end } = {}
) {
  addInfo(
    `[Analyze] createDecodedStream (${encoding}) | HWM=${highWaterMark} | range=${start ?? 0}-${end ?? "∞"}`,
    filePath
  );

  const rs = createReadStream(filePath, {
    highWaterMark,
    start,
    end,
  });

  if (encoding === "latin1") {
    addInfo(`[Analyze] using iconv.decodeStream("latin1")`, filePath);
    return rs.pipe(iconv.decodeStream("latin1"));
  }
  rs.setEncoding("utf8");
  return rs;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 3) DETECTAR DELIMITADOR (robusto p/ headers longos, 80 colunas)            */
/* ────────────────────────────────────────────────────────────────────────── */
export async function detectDelimiter(
  filePath,
  encoding /* 'utf8' | 'latin1' */,
  {
    minHeadBytes = 64 * 1024,
    maxHeadBytes = 1024 * 1024,
    head: preHead,
    headText,
    headBytes,
  } = {}
) {
  const t0 = performance.now();
  addInfo(
    `[Analyze] detectDelimiter/start min=${minHeadBytes} max=${maxHeadBytes}`,
    filePath
  );

  let head = preHead;
  const hasProvidedText = typeof headText === "string";
  let reusedHead = Boolean(head) || hasProvidedText;
  let bytesForLog = typeof headBytes === "number" ? headBytes : undefined;

  if (!head && !hasProvidedText) {
    const res = await readHeadOnce(filePath, minHeadBytes);
    head = res.headBuf;
  }

  if (typeof bytesForLog !== "number" && head) {
    bytesForLog = head.length;
  }

  if (reusedHead) {
    addInfo(`[Analyze] detectDelimiter/reused_head=true`, filePath);
  } else {
    addInfo(`[Analyze] detectDelimiter/reused_head=false`, filePath);
  }

  if (typeof bytesForLog !== "number" && hasProvidedText) {
    const byteEncoding = encoding === "latin1" ? "latin1" : "utf8";
    bytesForLog = Buffer.byteLength(headText, byteEncoding);
  }

  addInfo(
    `[Analyze] detectDelimiter/head bytes=${bytesForLog ?? 0}`,
    filePath
  );

  let text;
  if (hasProvidedText) {
    text = headText;
  } else {
    head = head ?? Buffer.alloc(0);
    text =
      encoding === "latin1" ? iconv.decode(head, "latin1") : head.toString("utf8");
  }

  const hasNewline = text.includes("\n") || text.includes("\r");
  if (!hasNewline && (head?.length ?? bytesForLog ?? 0) < maxHeadBytes) {
    const currentLen = head?.length ?? bytesForLog ?? 0;
    const bigger = Math.min(currentLen * 4 || minHeadBytes, maxHeadBytes);
    addInfo(
      `[Analyze] detectDelimiter/no-newline → upscale head to ${bigger} bytes`,
      filePath
    );
    const res = await readHeadOnce(filePath, bigger);
    head = res.headBuf;
    text =
      encoding === "latin1"
        ? iconv.decode(head, "latin1")
        : head.toString("utf8");
  }

  let firstLine = "";
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l) { firstLine = l; break; }
  }
  if (!firstLine) {
    addAviso(
      `[Analyze] detectDelimiter/empty-first-line → assumindo ";"`,
      filePath
    );
  }

  const candidates = [";", ",", "\t", "|"];
  let bestDelim = ";";
  let bestCount = -1;

  for (let k = 0; k < candidates.length; k++) {
    const d = candidates[k];
    let cnt = 0;
    for (let i = 0; i < firstLine.length; i++) {
      if (firstLine[i] === d) cnt++;
    }
    if (cnt > bestCount) { bestCount = cnt; bestDelim = d; }
  }

  const t1 = performance.now();
  addInfo(
    `[Analyze] detectDelimiter/result "${bestDelim}" | cols≈${bestCount + 1} (${(t1 - t0).toFixed(0)}ms)`,
    filePath
  );

  return bestDelim;
}
