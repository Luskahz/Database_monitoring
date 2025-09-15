// New logger implementing batch write with backpressure
import fs from 'fs';
import path from 'path';

const loggers = new Map();
const FLUSH_MS = Number(process.env.LOG_FLUSH_MS || 200);
const FLUSH_LINES = Number(process.env.LOG_FLUSH_LINES || 20);
const CLOSE_TIMEOUT_MS = Number(process.env.LOG_CLOSE_TIMEOUT_MS || 10000);

export function fmtTimeNow() {
  return new Date().toISOString();
}

function getLogger(filePath) {
  return loggers.get(filePath);
}

function waitForDrain(stream) {
  return new Promise((resolve, reject) => {
    let settled = false;
    function cleanup() {
      stream.off('drain', onDrain);
      stream.off('error', onError);
      stream.off('close', onClose);
    }
    function onDrain() {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    }
    function onClose() {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    }
    function onError(err) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    }

    stream.once('drain', onDrain);
    stream.once('error', onError);
    stream.once('close', onClose);
  });
}

async function flush(filePath) {
  const entry = loggers.get(filePath);
  if (!entry || entry.buffer.length === 0) return;
  const data = entry.buffer.join('');
  entry.buffer.length = 0;
  try {
    if (!entry.stream.write(data)) {
      await waitForDrain(entry.stream);
    }
  } catch (err) {
    entry.stream.destroy?.(err);
    throw err;
  }
}

export function startLogger(filePath) {
  if (loggers.has(filePath)) return;
  const dir = path.join(path.dirname(filePath), 'loggers');
  fs.mkdirSync(dir, { recursive: true });
  const logPath = path.join(dir, `Logger_${path.parse(filePath).name}.txt`);
  const stream = fs.createWriteStream(logPath, { flags: 'a', highWaterMark: 1024 * 1024 });
  const buffer = [];
  const timer = setInterval(() => {
    flush(filePath).catch(() => {});
  }, FLUSH_MS);
  timer.unref?.();
  loggers.set(filePath, { stream, buffer, timer });
  logLine(filePath, 'INFO', `==== BEGIN ${fmtTimeNow()} ====`).catch(() => {});
}

export async function logLine(filePath, level, msg) {
  const entry = loggers.get(filePath);
  if (!entry) return;
  entry.buffer.push(`[${fmtTimeNow()}][${level.toUpperCase()}] ${msg}\n`);
  if (entry.buffer.length >= FLUSH_LINES) {
    await flush(filePath);
  }
}

function waitForStreamClose(stream) {
  return new Promise((resolve, reject) => {
    let settled = false;
    function cleanup() {
      stream.off('finish', onFinish);
      stream.off('close', onClose);
      stream.off('error', onError);
      if (timeoutId) clearTimeout(timeoutId);
    }
    const timeoutId = CLOSE_TIMEOUT_MS
      ? setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          stream.destroy();
          resolve();
        }, CLOSE_TIMEOUT_MS)
      : null;
    function settle(err) {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) reject(err);
      else resolve();
    }
    function onFinish() {
      settle();
    }
    function onClose() {
      settle();
    }
    function onError(err) {
      settle(err);
    }

    stream.once('finish', onFinish);
    stream.once('close', onClose);
    stream.once('error', onError);

    try {
      stream.end();
    } catch (err) {
      settle(err);
    }
  });
}

export async function endLogger(filePath) {
  const entry = loggers.get(filePath);
  if (!entry) return;
  if (entry.endingPromise) return entry.endingPromise;

  entry.endingPromise = (async () => {
    clearInterval(entry.timer);
    try {
      await logLine(filePath, 'INFO', `==== END ${fmtTimeNow()} ====`);
    } catch {}
    try {
      await flush(filePath);
    } catch (err) {
      entry.stream.destroy?.(err);
      throw err;
    }
    try {
      await waitForStreamClose(entry.stream);
    } finally {
      loggers.delete(filePath);
    }
  })();

  return entry.endingPromise;
}

export async function appendLine(contexto, line) {
  // compatibility wrapper for old API
  await logLine(contexto, 'INFO', line.trim());
}

export async function endAllLoggers() {
  const promises = [];
  for (const key of Array.from(loggers.keys())) {
    promises.push(endLogger(key));
  }
  await Promise.all(promises);
}

export default { startLogger, logLine, endLogger };
