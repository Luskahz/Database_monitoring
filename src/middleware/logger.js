import fs from "fs";
import path from "path";
import { addErro, addInfo } from "./errorHandler.js";

const loggers = new Map();
const FLUSH_MS = Number(process.env.LOG_FLUSH_MS);
const FLUSH_LINES = Number(process.env.LOG_FLUSH_LINES);
const CLOSE_TIMEOUT_MS = Number(process.env.LOG_CLOSE_TIMEOUT_MS);

const LOG_ROOT = path.resolve(process.cwd(), "logs");
const ACTIVITY_LOG_KEY = "__activity__";
const ACTIVITY_LOG_PATH = path.join(LOG_ROOT, "_activity.txt");
const BR_TIMEZONE = "America/Sao_Paulo";

const PATH_TOKEN_REGEX =
  /(src|work|path|staging[a-z0-9_]*)(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"';]+))/gi;

const brTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: BR_TIMEZONE,
});

const brDateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: BR_TIMEZONE,
});

fs.mkdirSync(LOG_ROOT, { recursive: true });

export function fmtTimeNow() {
  return new Date().toISOString();
}

export function fmtBrTime(date = new Date()) {
  const parts = brTimeFormatter.formatToParts(date);
  const bucket = { hour: "00", minute: "00", second: "00" };
  for (const part of parts) {
    if (
      part.type === "hour" ||
      part.type === "minute" ||
      part.type === "second"
    ) {
      bucket[part.type] = part.value;
    }
  }
  const millis = String(date.getMilliseconds()).padStart(3, "0");
  return `${bucket.hour}:${bucket.minute}:${bucket.second}:${millis}`;
}

function fmtBrDateTime(date = new Date()) {
  const parts = brDateTimeFormatter.formatToParts(date);
  const bucket = {
    day: "01",
    month: "01",
    year: "1970",
    hour: "00",
    minute: "00",
    second: "00",
  };
  for (const part of parts) {
    if (part.type in bucket) {
      bucket[part.type] = part.value;
    }
  }
  return `${bucket.day}/${bucket.month}/${bucket.year}, ${bucket.hour}:${bucket.minute}:${bucket.second}`;
}

function formatLine(level, msg) {
  return `[${fmtBrTime()}][${String(level ?? "info").toUpperCase()}] ${msg}\n`;
}

function getEntry(filePath) {
  return loggers.get(filePath);
}

function waitForDrain(stream) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      stream.off("drain", onDrain);
      stream.off("error", onError);
      stream.off("close", onClose);
    };
    const onDrain = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onClose = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onError = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    stream.once("drain", onDrain);
    stream.once("error", onError);
    stream.once("close", onClose);
  });
}

function defaultLogPath(filePath) {
  const dir = path.join(path.dirname(filePath), "loggers");
  const base = path.parse(filePath).name || path.basename(filePath) || "log";
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `Logger_${base}.txt`);
}

export function shortPath(p) {
  if (!p) return "";
  const raw = String(p);
  const normalized = raw.replace(/\\/g, "/");
  const match = normalized.match(/\/(\d{2}_\d{2}_\d{2})\/(\d{4})\/([^/]+)$/);
  if (match) {
    const [, tabela, ano, arquivo] = match;
    return `\\${tabela}\\${ano}\\${arquivo}`;
  }
  const base = path.basename(raw);
  return base ? `\\${base}` : "";
}

export function shortenPathsInMsg(msg, fallbackShort = "") {
  if (!msg) return msg;
  const safeFallback = fallbackShort || "";
  return msg.replace(
    PATH_TOKEN_REGEX,
    (full, key, separator, doubleValue, singleValue, bareValue) => {
      const originalValue = doubleValue ?? singleValue ?? bareValue ?? "";
      const keyLower = String(key).toLowerCase();
      const normalizedValue = String(originalValue).toLowerCase();
      let replacement = shortPath(originalValue);

      if ((!replacement || replacement === "\\") && safeFallback) {
        replacement = safeFallback;
      }

      if (
        keyLower.startsWith("staging") ||
        normalizedValue.includes("staging")
      ) {
        replacement = safeFallback || replacement || shortPath(originalValue);
      }

      if (!replacement) {
        replacement = originalValue;
      }

      const quote =
        doubleValue !== undefined ? '"' : singleValue !== undefined ? "'" : "";
      return `${key}${separator}${quote}${replacement}${quote}`;
    }
  );
}

function waitForStreamToEnd(stream) {
  let settled = false;
  let cleanup = () => {};
  let timeoutId;

  const eventsPromise = new Promise((resolve) => {
    const settle = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const onFinish = () => settle({ status: "finish" });
    const onClose = () => settle({ status: "close" });
    const onError = (error) => settle({ status: "error", error });

    cleanup = () => {
      stream.off("finish", onFinish);
      stream.off("close", onClose);
      stream.off("error", onError);
      if (timeoutId) clearTimeout(timeoutId);
    };

    stream.once("finish", onFinish);
    stream.once("close", onClose);
    stream.once("error", onError);
  });

  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ status: "timeout" });
    }, CLOSE_TIMEOUT_MS);
    timeoutId.unref?.();
  });

  return Promise.race([eventsPromise, timeoutPromise]);
}

export function startLogger(filePath, options = {}) {
  if (!filePath) return null;
  if (loggers.has(filePath)) return loggers.get(filePath);

  const {
    logPath: forcedPath,
    flushIntervalMs = FLUSH_MS,
    highWaterMark = 1024 * 256,
    disableBeginLine = true,
    disableEndLine = false,
    displayName,
    overwrite = true,
  } = options;

  const logPath = forcedPath || defaultLogPath(filePath);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });

  const shouldAppend =
    filePath === ACTIVITY_LOG_KEY ? true : overwrite === false;
  const stream = fs.createWriteStream(logPath, {
    flags: shouldAppend ? "a" : "w",
    highWaterMark,
  });

  const entry = {
    filePath,
    logPath,
    stream,
    buffer: [],
    timer: null,
    inFlush: false,
    flushPromise: null, // inicializa a promise de flush para evitar acessos antes da atribuição
    closing: false,
    ended: false,
    endPromise: null,
    displayName: displayName || path.basename(filePath) || filePath,
    disableEndLine: Boolean(disableEndLine),
  };

  stream.on("error", (err) => {
    if (!entry.ended) {
      entry.ended = true;
      addErro(
        `[logger] erro no stream (${entry.displayName}): ${
          err?.message || err
        }`,
        filePath
      );
    }
  });

  stream.on("close", () => {
    entry.ended = true;
  });

  if (flushIntervalMs > 0) {
    const timer = setInterval(() => {
      flush(filePath).catch((err) => {
        addErro(
          `[logger] flush falhou (${entry.displayName}): ${
            err?.message || err
          }`,
          filePath
        );
      });
    }, flushIntervalMs);
    timer.unref?.();
    entry.timer = timer;
  }

  loggers.set(filePath, entry);

  if (!disableBeginLine) {
    void logLine(filePath, "info", `==== BEGIN ${entry.displayName} ====`);
  }

  return entry;
}

export async function logLine(filePath, level, msg) {
  const entry = getEntry(filePath);
  if (!entry || entry.closing || entry.ended) return false;

  entry.buffer.push(formatLine(level, msg));
  if (entry.buffer.length >= FLUSH_LINES) {
    await flush(filePath);
  }
  return true;
}

async function writeLines(filePath, lines) {
  for (const line of lines) {
    await logLine(filePath, "info", line);
  }
}

export async function writeBeginFile({
  filePath,
  arquivo,
  tabela,
  dataStr,
  acao,
  hash,
}) {
  const now = fmtBrDateTime();
  await writeLines(filePath, [
    `---------------- BEGIN FILE ${now} ----------------`,
    `Arquivo: ${arquivo ?? "—"}`,
    `Tabela : ${tabela ?? "—"}`,
    `Data   : ${dataStr ?? "—"}`,
    `Acao   : ${acao ?? "analyze"}`,
    `Hash   : ${hash ?? "—"}`,
    "-----------------------------------------------------",
  ]);
}

function columnWidth(title, values) {
  let width = title.length;
  for (const value of values) {
    const len = String(value ?? "").length;
    if (len > width) width = len;
  }
  return width;
}

function pad(value, width) {
  return String(value ?? "").padEnd(width, " ");
}

export async function writeHeadersDiff({
  filePath,
  tabela,
  headersCsv = [],
  headersTabela = [],
}) {
  const csvHeaders = Array.isArray(headersCsv) ? headersCsv : [];
  const tabelaHeaders = Array.isArray(headersTabela) ? headersTabela : [];
  const csvTitle = `CSV (${csvHeaders.length})`;
  const tabelaTitle = `TABELA (${tabelaHeaders.length})`;
  const col1Width = columnWidth(csvTitle, csvHeaders);
  const col2Width = columnWidth(tabelaTitle, tabelaHeaders);
  const separator = `${"-".repeat(col1Width)}+${"-".repeat(col2Width)}`;
  const rows = [];
  const maxRows = Math.max(csvHeaders.length, tabelaHeaders.length);
  for (let i = 0; i < maxRows; i += 1) {
    rows.push(
      `${pad(csvHeaders[i] ?? "", col1Width)} | ${pad(
        tabelaHeaders[i] ?? "",
        col2Width
      )}`
    );
  }
  if (rows.length === 0) {
    rows.push(`${pad("—", col1Width)} | ${pad("—", col2Width)}`);
  }

  const tabelaSet = new Set(tabelaHeaders.map((h) => String(h ?? "")));
  const csvSet = new Set(csvHeaders.map((h) => String(h ?? "")));
  const extras = csvHeaders
    .map((h) => String(h ?? ""))
    .filter((h) => !tabelaSet.has(h));
  const missing = tabelaHeaders
    .map((h) => String(h ?? ""))
    .filter((h) => !csvSet.has(h));

  await writeLines(filePath, [
    "---------------- HEADERS CSV × TABELA ----------------",
    `Tabela: ${tabela ?? "—"}`,
    `${pad(csvTitle, col1Width)} | ${pad(tabelaTitle, col2Width)}`,
    separator,
    ...rows,
    "---------------- DIFERENÇAS ----------------",
    `Extras no CSV   (${extras.length}): ${
      extras.length ? extras.join(", ") : "—"
    }`,
    `Faltando no CSV (${missing.length}): ${
      missing.length ? missing.join(", ") : "—"
    }`,
    "-----------------------------------------------------",
  ]);
}

export async function writeStatusUpdate({
  filePath,
  arquivo,
  tabela,
  dataStr,
  acao,
  hash,
}) {
  const now = fmtBrDateTime();
  await writeLines(filePath, [
    `---------------- STATUS UPDATE ${now} ----------------`,
    `Arquivo: ${arquivo ?? "—"}`,
    `Tabela : ${tabela ?? "—"}`,
    `Data   : ${dataStr ?? "—"}`,
    `Acao   : ${acao ?? "—"}`,
    `Hash   : ${hash ?? "—"}`,
    "-----------------------------------------------------",
  ]);
}

export async function writeFinal({ filePath, dataStr }) {
  const stamp = dataStr || fmtBrDateTime();
  await writeLines(filePath, [`==== FINAL ${stamp} ====`]);
}

export async function flush(filePath) {
  const entry = getEntry(filePath);
  if (!entry) return;

  if (entry.ended || entry.stream.destroyed) {
    entry.buffer.length = 0;
    return;
  }

  // Se já tem flush em andamento, espera ele terminar
  if (entry.inFlush && entry.flushPromise) {
    try {
      await entry.flushPromise;
    } catch {}
    if (!entry.buffer.length) return;
  }

  if (entry.buffer.length === 0) return;

  const chunk = entry.buffer.join("");
  entry.buffer.length = 0;

  entry.inFlush = true;

  const runFlush = async () => {
    try {
      if (!entry.stream.writable || entry.stream.destroyed || entry.ended)
        return;
      if (!entry.stream.write(chunk)) {
        await waitForDrain(entry.stream);
      }
    } catch (err) {
      addErro(
        `[logger] erro ao escrever (${entry.displayName}):${
          err?.message || err
        }`,
        filePath
      );
      try {
        entry.stream.destroy?.(err);
      } catch {}
      entry.ended = true;
    } finally {
      entry.inFlush = false;
    }
  }; // executa a lógica de flush fora da IIFE para poder compartilhar a mesma promise

  const currentPromise = runFlush();
  entry.flushPromise = currentPromise; // garante que chamadas concorrentes compartilhem a mesma promise

  currentPromise.finally(() => {
    if (entry.flushPromise === currentPromise) {
      entry.flushPromise = null; // limpa somente quando nenhuma chamada posterior sobrescreveu a promise
    }
  });

  await currentPromise;
}

async function finalizeStream(entry, filePath) {
  if (!entry || entry.ended || entry.stream.destroyed) {
    entry.ended = true;
    return;
  }

  try {
    // listeners de debug ANTES do end()
    entry.stream.on("finish", () => {
      addInfo(
        `[logger-debug] FINISH emitido para ${entry.displayName}`,
        filePath
      );
    });
    entry.stream.on("close", () => {
      addInfo(
        `[logger-debug] CLOSE emitido para ${entry.displayName}`,
        filePath
      );
    });
    entry.stream.on("error", (err) => {
      addInfo(
        `[logger-debug] ERROR emitido para ${entry.displayName}:${
          err?.message || err
        }`,
        filePath
      );
    });

    // pede pro Node encerrar
    entry.stream.end();
    addInfo(`[logger-debug] END chamado para ${entry.displayName}`, filePath);
  } catch (err) {
    addErro(
      `[logger] stream.end falhou (${entry.displayName}): ${err?.message ||
        err}`,
      filePath
    );
    entry.ended = true;
    return;
  }

  const result = await waitForStreamToEnd(entry.stream);

  if (result.status === "error") {
    addErro(
      `[logger] erro ao finalizar stream (${entry.displayName}):${
        result.error?.message || result.error
      }`,
      filePath
    );
  } else if (result.status === "timeout") {
    addErro(
      `[logger] timeout ao finalizar stream (${entry.displayName})`,
      filePath
    );
    try {
      entry.stream.destroy?.();
    } catch {}
  } else {
    addInfo(
      `[logger-debug] finalizeStream concluiu com status=${result.status} (${entry.displayName})`,
      filePath
    );
  }

  entry.ended = true;
}

export async function endLogger(filePath) {
  const entry = getEntry(filePath);
  if (!entry) return;

  if (entry.endPromise) return entry.endPromise;

  entry.closing = true;
  if (entry.timer) {
    clearInterval(entry.timer);
    entry.timer = null;
  }

  entry.endPromise = (async () => {
    try {
      if (entry.inFlush && entry.flushPromise) {
        await entry.flushPromise;
      }

      if (!entry.ended && !entry.stream.destroyed) {
        if (!entry.disableEndLine) {
          entry.buffer.push(
            formatLine("info", `==== END ${entry.displayName} ====`)
          );
        }
        await flush(filePath).catch((err) => {
          addErro(
            `[logger] flush final falhou (${entry.displayName}): ${
              err?.message || err
            }`,
            filePath
          );
        });
      }

      await finalizeStream(entry, filePath);
    } catch (err) {
      addErro(
        `[logger] finalizeStream falhou (${entry.displayName}): ${
          err?.message || err
        }`,
        filePath
      );
    } finally {
      entry.ended = true;
      loggers.delete(filePath);
    }
  })();

  return entry.endPromise;
}

export async function endAllLoggers() {
  for (const [filePath] of Array.from(loggers.entries())) {
    try {
      await endLogger(filePath);
    } catch (err) {
      addErro(
        `[logger] falha ao encerrar ${filePath}: 
        ${err?.message || err}`,
        filePath
      );
    }
  }
}

export async function appendLine(contexto, line) {
  await logLine(contexto, "info", line.trim());
}

function ensureActivityLogger() {
  if (!loggers.has(ACTIVITY_LOG_KEY)) {
    startLogger(ACTIVITY_LOG_KEY, {
      logPath: ACTIVITY_LOG_PATH,
      displayName: "_activity",
      overwrite: false,
    });
  }
}

export function logActivity(level, message, { filePath, action } = {}) {
  ensureActivityLogger();
  const segments = [];
  if (filePath) segments.push(path.basename(filePath));
  if (action) segments.push(action);
  const prefix = segments.length ? `[${segments.join(" | ")}] ` : "";
  return logLine(ACTIVITY_LOG_KEY, level, `${prefix}${message}`);
}

export default {
  startLogger,
  logLine,
  flush,
  endLogger,
  endAllLoggers,
  logActivity,
  fmtTimeNow,
  fmtBrTime,
  shortPath,
  shortenPathsInMsg,
  writeBeginFile,
  writeHeadersDiff,
  writeStatusUpdate,
  writeFinal,
};
