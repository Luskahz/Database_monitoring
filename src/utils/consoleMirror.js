import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export const CONSOLE_LOG_PATH = path.resolve(process.cwd(), "logs", "_console.txt");

let installed = false;
let stream = null;

function ensureStream() {
  if (stream) return stream;
  fs.mkdirSync(path.dirname(CONSOLE_LOG_PATH), { recursive: true });
  fs.writeFileSync(CONSOLE_LOG_PATH, "");
  stream = fs.createWriteStream(CONSOLE_LOG_PATH, {
    flags: "w",
    highWaterMark: 64 * 1024,
  });
  return stream;
}

function normalizeChunk(chunk, encoding) {
  if (Buffer.isBuffer(chunk)) {
    return chunk.toString(typeof encoding === "string" ? encoding : "utf8");
  }
  return String(chunk ?? "");
}

export function setupConsoleMirror() {
  if (installed) {
    return { path: CONSOLE_LOG_PATH };
  }

  installed = true;
  const output = ensureStream();
  const original = {
    stdoutWrite: process.stdout.write.bind(process.stdout),
    stderrWrite: process.stderr.write.bind(process.stderr),
  };

  const mirrorChunk = (chunk, encoding) => {
    try {
      const text = normalizeChunk(chunk, encoding);
      if (!text) return;
      output.write(text);
    } catch (err) {
      try {
        original.stderrWrite(
          `[console-mirror] Falha ao gravar espelho do console: ${err?.message || err}\n`
        );
      } catch {}
    }
  };

  process.stdout.write = function patchedStdoutWrite(chunk, encoding, callback) {
    mirrorChunk(chunk, encoding);
    return original.stdoutWrite(chunk, encoding, callback);
  };

  process.stderr.write = function patchedStderrWrite(chunk, encoding, callback) {
    mirrorChunk(chunk, encoding);
    return original.stderrWrite(chunk, encoding, callback);
  };

  process.once("exit", () => {
    try {
      output.write(`\n[console-mirror] process exit ${new Date().toISOString()}\n`);
      output.end();
    } catch {}
  });

  try {
    output.write(`\n[console-mirror] process start ${new Date().toISOString()} pid=${process.pid}\n`);
  } catch {}

  return { path: CONSOLE_LOG_PATH };
}
