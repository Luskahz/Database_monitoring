// utils/debugHeader.js
import fs from "fs/promises";
import iconv from "iconv-lite";

/**
 * Mostra o primeiro \n lógico decodificado e também um hexdump do começo do arquivo.
 */
export async function debugPeekHeader(filePath, encoding /* 'utf8' | 'latin1' */) {
  const buf = await fs.readFile(filePath, { length: 65536 }); // ~64KB
  const decoded = encoding === "latin1"
    ? iconv.decode(buf, "latin1")
    : buf.toString("utf8");

  const firstLine = decoded.split(/\r?\n/).find(l => l.length > 0) ?? "";

  // hexdump dos primeiros bytes (pra ver BOM, etc.)
  const hexPreview = buf.subarray(0, 64).toString("hex").match(/.{1,2}/g)?.join(" ") ?? "";

  // contagem de separadores na linha crua (pra conferir delimiter)
  const counts = {
    ";": (firstLine.match(/;/g) || []).length,
    ",": (firstLine.match(/,/g) || []).length,
    "\\t": (firstLine.match(/\t/g) || []).length,
    "|": (firstLine.match(/\|/g) || []).length,
  };

  // code points (pra ver acentos e se tem caractere estranho)
  const cps = Array.from(firstLine)
    .map(ch => `${ch} U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4,"0")}`)
    .join(" | ");

  console.log("=== DEBUG HEADER BRUTO ===");
  console.log("Encoding detectado:", encoding);
  console.log("Hex dos 64 primeiros bytes:", hexPreview);
  console.log("Primeira linha decodificada (crua):");
  console.log(firstLine);
  console.log("Code points da primeira linha:");
  console.log(cps);
  console.log("Contagem possível de delimiters:", counts);
  console.log("==========================");
}