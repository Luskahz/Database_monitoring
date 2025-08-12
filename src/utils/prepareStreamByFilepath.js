import fs from "fs/promises";
import chardet from "chardet";
import { createReadStream } from "fs";
import iconv from "iconv-lite";
import { PassThrough } from "stream";

export async function detectEncoding(filePath) {
  const head = await fs.readFile(filePath, { length: 65536 }).catch(() => null);
  const enc = (head && chardet.detect(head)) || "UTF-8";
  return enc.toUpperCase().startsWith("ISO-8859") ? "latin1" : "utf8";
}

export async function createDecodedStream(
  filePath,
  encoding /* 'utf8' | 'latin1' */
) {
  const rs = createReadStream(filePath); // em Buffer
  if (encoding === "latin1") {
    const pt = new PassThrough();
    rs.on("data", (chunk) => pt.write(iconv.decode(chunk, "latin1")));
    rs.on("end", () => pt.end());
    rs.on("error", (e) => pt.destroy(e));
    return pt.setEncoding("utf8"); // Papa receberá sempre UTF-8
  }
  rs.setEncoding("utf8");
  return rs;
}

export async function detectDelimiter(
  filePath,
  encoding /* 'utf8' | 'latin1' */
) {
  const head = await fs.readFile(filePath, { length: 20120 }); // ~20KB
  const text =
    encoding === "latin1"
      ? iconv.decode(head, "latin1")
      : head.toString("utf8");
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== "") || "";

  const candidates = [";", ",", "\t", "|"];
  let best = { delimiter: ";", count: 0 };
  for (const d of candidates) {
    const count = firstLine.split(d).length;
    if (count > best.count) best = { delimiter: d, count };
  }
  return best.delimiter;
}
