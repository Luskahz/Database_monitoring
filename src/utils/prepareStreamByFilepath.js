import fs from "fs/promises";
import { createReadStream } from "fs";
import chardet from "chardet";
import iconv from "iconv-lite";

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
  const head = await readHead(filePath, headBytes).catch(() => null);
  const guess = head ? chardet.detect(head) : null;
  const s = (guess || "").toUpperCase();

  if (s.includes("UTF-8")) return { encoding: "utf8", head };
  if (
    s.includes("ISO-8859") ||
    s.includes("WINDOWS-1252") ||
    s.includes("CP1252") ||
    s.includes("WIN-1252")
  ) {
    return { encoding: "latin1", head };
  }
  
  return { encoding: fallback, head };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 2) CRIAR STREAM DECODIFICADO COM highWaterMark AJUSTÁVEL                   */
/* ────────────────────────────────────────────────────────────────────────── */
export async function createDecodedStream(
  filePath,
  encoding /* 'utf8' | 'latin1' */,
  { highWaterMark = 1024 * 1024, start, end } = {} 
) {
  const rs = createReadStream(filePath, {
    highWaterMark,
    start,               
    end,                 
  });

  if (encoding === "latin1") {
  
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
  let head = preHead ?? (await readHead(filePath, minHeadBytes));
  let text =
    encoding === "latin1" ? iconv.decode(head, "latin1") : head.toString("utf8");

  const hasNewline = text.indexOf("\n") !== -1 || text.indexOf("\r") !== -1;
  if (!hasNewline && head.length < maxHeadBytes) {
    const bigger = Math.min(head.length * 4, maxHeadBytes);
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

  return bestDelim;
}
