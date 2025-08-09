import crypto from "crypto";

// Stringify estável: ordena chaves (determinístico)
function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const keys = Object.keys(obj).sort();
  const body = keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",");
  return `{${body}}`;
}

export default async function createHashByData(input) {
  const hash = crypto.createHash("sha256");

  // Array
  if (Array.isArray(input)) {
    for (const linha of input) hash.update(stableStringify(linha));
    return hash.digest("hex");
  }
  // Iterable síncrono
  if (input && typeof input[Symbol.iterator] === "function") {
    for (const linha of input) hash.update(stableStringify(linha));
    return hash.digest("hex");
  }
  // AsyncIterable (streaming)
  if (input && typeof input[Symbol.asyncIterator] === "function") {
    for await (const linha of input) hash.update(stableStringify(linha));
    return hash.digest("hex");
  }

  throw new Error("createHashByData: tipo de input não suportado.");
}