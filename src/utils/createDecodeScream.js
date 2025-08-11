import fs from "fs/promises";
import { createReadStream } from "fs";
import iconv from "iconv-lite";
import chardet from "chardet";
import { PassThrough } from "stream";

export async function createDecodedStream(filePath) {
  const buf = await fs.readFile(filePath, { length: 65536 }).catch(() => null);
  const enc = (buf && chardet.detect(buf)) || "UTF-8";
  const s = createReadStream(filePath);
  if (enc.toUpperCase().startsWith("ISO-8859")) {
    const pt = new PassThrough();
    s.on("data", (chunk) => pt.write(iconv.decode(chunk, "latin1")));
    s.on("end", () => pt.end());
    s.on("error", (e) => pt.destroy(e));
    return pt.setEncoding("utf8");
  }
  s.setEncoding("utf8");
  return s;
}