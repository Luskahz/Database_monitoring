import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import util from "node:util";

export const CONSOLE_LOG_PATH = path.resolve(process.cwd(), "logs", "_console.txt");

let installed = false;
let stream = null;

function ensureStream() {
  if (stream) return stream;
  fs.mkdirSync(path.dirname(CONSOLE_LOG_PATH), { recursive: true });
  stream = fs.createWriteStream(CONSOLE_LOG_PATH, {
    flags: "a",
    highWaterMark: 64 * 1024,
  });
  return stream;
}

function formatConsoleLine(level, args) {
  const rendered = util.formatWithOptions(
    {
      colors: false,
      depth: 6,
      breakLength: 120,
      maxArrayLength: 50,
    },
    ...args
  );
  return `[${new Date().toISOString()}][${level}] ${rendered}\n`;
}

export function setupConsoleMirror() {
  if (installed) {
    return { path: CONSOLE_LOG_PATH };
  }

  installed = true;
  const output = ensureStream();
  const original = {
    log: console.log.bind(console),
    info: (console.info || console.log).bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  const mirror = (level, args) => {
    try {
      output.write(formatConsoleLine(level, args));
    } catch (err) {
      original.error("[console-mirror] Falha ao gravar espelho do console:", err?.message || err);
    }
  };

  console.log = (...args) => {
    mirror("INFO", args);
    original.log(...args);
  };

  console.info = (...args) => {
    mirror("INFO", args);
    original.info(...args);
  };

  console.warn = (...args) => {
    mirror("WARN", args);
    original.warn(...args);
  };

  console.error = (...args) => {
    mirror("ERROR", args);
    original.error(...args);
  };

  process.once("exit", () => {
    try {
      output.end();
    } catch {}
  });

  return { path: CONSOLE_LOG_PATH };
}
