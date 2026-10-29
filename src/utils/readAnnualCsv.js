import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import iconv from "iconv-lite";
import Papa from "papaparse";

// O modo NODE_STREAM_INPUT do Papa descarta results.errors. Usamos chunk para
// verificar erros de aspas e pausamos também a fonte enquanto o lote vai ao DB.
export async function readAnnualCsv(filePath, { encoding, delimiter, onRows }) {
  const hash = createHash("sha256");
  const source = createReadStream(filePath, { highWaterMark: 64 * 1024 });
  const hashing = new Transform({ transform(chunk, _encoding, callback) {
    hash.update(chunk);
    callback(null, chunk);
  } });
  const input = iconv.decodeStream(encoding);
  let handle;
  let settled = false;
  let pending = Promise.resolve();
  let rejectParse;
  const parsed = new Promise((resolve, reject) => {
    rejectParse = reject;
    Papa.parse(input, {
      header: false, delimiter, skipEmptyLines: "greedy", dynamicTyping: false,
      chunk(results, parser) {
        handle = parser;
        parser.pause();
        input.pause();
        pending = pending.then(async () => {
          if (settled) return;
          if (results.errors.length) {
            throw new Error(`[Anual] CSV malformado: ${results.errors[0].message}`);
          }
          await onRows(results.data);
          if (!settled) {
            parser.resume();
            input.resume();
          }
        }).catch(fail);
      },
      complete() { if (!settled) { settled = true; resolve(); } },
      error: fail,
    });
  });
  function fail(error) {
    if (settled) return;
    settled = true;
    rejectParse(error);
    handle?.abort();
    input.destroy();
    source.destroy();
  }
  const reading = pipeline(source, hashing, input).catch(fail);
  try {
    await parsed;
    await pending;
    await reading;
    return hash.digest("hex");
  } finally {
    source.destroy();
    input.destroy();
    await reading;
    await pending;
  }
}
