import fs from "fs/promises";
import { createReadStream } from "fs";
import chardet from "chardet";
import iconv from "iconv-lite";
import { addInfo, addAviso } from "../middleware/errorHandler.js"; // <-- já usa no resto

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
/* 1) DETECTAR ENCODING                                                       */
/* ────────────────────────────────────────────────────────────────────────── */
export async function detectEncoding(
  filePath,
  { headBytes = 64 * 1024, fallback = "latin1" } = {}
) {
  addInfo(`[Analyze] Detectando encoding...`, filePath);

  const head = await readHead(filePath, headBytes).catch(() => null);
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

  if (!guess) {
    addAviso(`[Analyze] Encoding não detectado, aplicando fallback: ${encoding}`, filePath);
  } else {
    addInfo(`[Analyze] Encoding detectado: ${encoding} (chardet="${s}")`, filePath);
  }

  return { encoding, head };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 2) CRIAR STREAM DECODIFICADO                                               */
/* ────────────────────────────────────────────────────────────────────────── */
export async function createDecodedStream(
  filePath,
  encoding,
  { highWaterMark = 1024 * 1024, start, end } = {}
) {
  addInfo(`[Analyze] Criando stream decodificado (${encoding})`, filePath);

  const rs = createReadStream(filePath, { highWaterMark, start, end });

  if (encoding === "latin1") {
    return rs.pipe(iconv.decodeStream("latin1"));
  }
  rs.setEncoding("utf8");
  return rs;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 3) DETECTAR DELIMITADOR                                                    */
/* ────────────────────────────────────────────────────────────────────────── */
export async function detectDelimiter(
  filePath,
  encoding,
  {
    minHeadBytes = 64 * 1024,
    maxHeadBytes = 1024 * 1024,
    head: preHead,
  } = {}
) {
  addInfo(`[Analyze] Detectando delimitador...`, filePath);

  let head = preHead ?? (await readHead(filePath, minHeadBytes));
  let text =
    encoding === "latin1" ? iconv.decode(head, "latin1") : head.toString("utf8");

  const hasNewline = text.includes("\n") || text.includes("\r");
  if (!hasNewline && head.length < maxHeadBytes) {
    const bigger = Math.min(head.length * 4, maxHeadBytes);
    head = await readHead(filePath, bigger);
    text =
      encoding === "latin1"
        ? iconv.decode(head, "latin1")
        : head.toString("utf8");
  }

  let firstLine = "";
  for (const l of text.split(/\r?\n/)) {
    if (l.trim()) { firstLine = l.trim(); break; }
  }

  const candidates = [";", ",", "\t", "|"];
  let bestDelim = ";";
  let bestCount = -1;

  for (const d of candidates) {
    const cnt = firstLine.split(d).length - 1;
    if (cnt > bestCount) { bestCount = cnt; bestDelim = d; }
  }

  addInfo(`[Analyze] Delimitador detectado: "${bestDelim}" (colunas: ${bestCount + 1})`, filePath);

  return bestDelim;
}
