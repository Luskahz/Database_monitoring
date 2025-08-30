import fs from "fs/promises";
import { createReadStream } from "fs";
import chardet from "chardet";
import iconv from "iconv-lite";
import { addInfo, addAviso } from "../middleware/errorHandler.js";
import { performance } from "node:perf_hooks";

async function readHead(filePath, bytes) {
  const fh = await fs.open(filePath, "r");
  try {
    const buf = Buffer.allocUnsafe(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 1) DETECTAR ENCODING (lendo apenas um pedaço do início)                    */
/* ────────────────────────────────────────────────────────────────────────── */
export async function detectEncoding(
  filePath,
  { headBytes = 64 * 1024, fallback = "latin1" } = {}
) {
  const t0 = performance.now();
  addInfo(`[Analyze] detectEncoding/start headBytes=${headBytes}`, filePath);

  const head = await readHead(filePath, headBytes).catch(() => null);
  addInfo(
    `[Analyze] detectEncoding/head bytes=${head ? head.length : 0}`,
    filePath
  );

  const guess = head ? chardet.detect(head) : null;
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
      filePath
    );
  } else {
    addInfo(
      `[Analyze] detectEncoding/chardet="${s}" → ${encoding} (${(t1 - t0).toFixed(0)}ms)`,
      filePath
    );
  }

  return { encoding, head };
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
  } = {}
) {
  const t0 = performance.now();
  addInfo(
    `[Analyze] detectDelimiter/start min=${minHeadBytes} max=${maxHeadBytes}`,
    filePath
  );

  let head = preHead ?? (await readHead(filePath, minHeadBytes));
  addInfo(
    `[Analyze] detectDelimiter/head bytes=${head.length}`,
    filePath
  );

  let text =
    encoding === "latin1" ? iconv.decode(head, "latin1") : head.toString("utf8");

  const hasNewline = text.includes("\n") || text.includes("\r");
  if (!hasNewline && head.length < maxHeadBytes) {
    const bigger = Math.min(head.length * 4, maxHeadBytes);
    addInfo(
      `[Analyze] detectDelimiter/no-newline → upscale head to ${bigger} bytes`,
      filePath
    );
    head = await readHead(filePath, bigger);
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
