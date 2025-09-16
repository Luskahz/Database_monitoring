import fs from "fs";
import path from "path";

const loggers = new Map();

const FLUSH_MS = Number(process.env.LOG_FLUSH_MS || 200);
const FLUSH_LINES = Number(process.env.LOG_FLUSH_LINES || 100);
const CLOSE_TIMEOUT_MS = Number(process.env.LOG_CLOSE_TIMEOUT_MS || 5000);

const LOG_ROOT = path.resolve(process.cwd(), "logs");
const ACTIVITY_LOG_KEY = "__activity__";
const ACTIVITY_LOG_PATH = path.join(LOG_ROOT, "_activity.txt");

fs.mkdirSync(LOG_ROOT, { recursive: true });

export function fmtTimeNow() {
  return new Date().toISOString();
}

function formatLine(level, msg) {
  return `[${fmtTimeNow()}][${String(level ?? "info").toUpperCase()}] ${msg}\n`;
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
    disableBeginLine = false,
    displayName,
  } = options;

  const logPath = forcedPath || defaultLogPath(filePath);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });

  const stream = fs.createWriteStream(logPath, {
    flags: "a",
    highWaterMark,
  });

  const entry = {
    filePath,
    logPath,
    stream,
    buffer: [],
    timer: null,
    inFlush: false,
    flushPromise: null,
    closing: false,
    ended: false,
    endPromise: null,
    displayName: displayName || path.basename(filePath) || filePath,
  };

  stream.on("error", (err) => {
    if (!entry.ended) {
      entry.ended = true;
      console.error(`[logger] erro no stream (${entry.displayName}):`, err?.message || err);
    }
  });

  stream.on("close", () => {
    entry.ended = true;
  });

  if (flushIntervalMs > 0) {
    const timer = setInterval(() => {
      flush(filePath).catch((err) => {
        console.error(`[logger] flush falhou (${entry.displayName}):`, err?.message || err);
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

  const currentPromise = (async () => {
    try {
      if (!entry.stream.writable || entry.stream.destroyed || entry.ended) return;
      if (!entry.stream.write(chunk)) {
        await waitForDrain(entry.stream);
      }
    } catch (err) {
      console.error(`[logger] erro ao escrever (${entry.displayName}):`, err?.message || err);
      try {
        entry.stream.destroy?.(err);
      } catch {}
      entry.ended = true;
    } finally {
      entry.inFlush = false;

      if (entry.flushPromise === currentPromise) {
        entry.flushPromise = null;
      }
    }
  })();

  entry.flushPromise = currentPromise;
  await currentPromise;
}


async function finalizeStream(entry) {
  if (!entry || entry.ended || entry.stream.destroyed) {
    entry.ended = true;
    return;
  }

  try {
    entry.stream.end();
  } catch (err) {
    console.error(`[logger] stream.end falhou (${entry.displayName}):`, err?.message || err);
    entry.ended = true;
    return;
  }

  const result = await waitForStreamToEnd(entry.stream);
  if (result.status === "error") {
    console.error(`[logger] erro ao finalizar stream (${entry.displayName}):`, result.error?.message || result.error);
  } else if (result.status === "timeout") {
    console.error(`[logger] timeout ao finalizar stream (${entry.displayName})`);
    try {
      entry.stream.destroy?.();
    } catch {}
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
    if (entry.inFlush && entry.flushPromise) {
      try {
        await entry.flushPromise;
      } catch (err) {
        console.error(`[logger] flush pendente falhou (${entry.displayName}):`, err?.message || err);
      }
    }

    if (!entry.ended && !entry.stream.destroyed) {
      entry.buffer.push(formatLine("info", `==== END ${entry.displayName} ====`));
      try {
        await flush(filePath);
      } catch (err) {
        console.error(`[logger] flush final falhou (${entry.displayName}):`, err?.message || err);
      }
    }

    try {
      await finalizeStream(entry);
    } catch (err) {
      console.error(`[logger] finalizeStream falhou (${entry.displayName}):`, err?.message || err);
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
      console.error(`[logger] falha ao encerrar ${filePath}:`, err?.message || err);
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
};
