// New logger implementing batch write with backpressure
import fs from 'fs';
import path from 'path';

const loggers = new Map();
const FLUSH_MS = Number(process.env.LOG_FLUSH_MS || 200);
const FLUSH_LINES = Number(process.env.LOG_FLUSH_LINES || 20);

export function fmtTimeNow() {
  return new Date().toISOString();
}

function getLogger(filePath) {
  return loggers.get(filePath);
}

async function flush(filePath) {
  const entry = loggers.get(filePath);
  if (!entry || entry.buffer.length === 0) return;
  const data = entry.buffer.join('');
  entry.buffer.length = 0;
  if (!entry.stream.write(data)) {
    await new Promise((resolve) => entry.stream.once('drain', resolve));
  }
}

export function startLogger(filePath) {
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

export async function endLogger(filePath) {
  const entry = loggers.get(filePath);
  if (!entry) return;
  await flush(filePath);
  await new Promise((resolve) => entry.stream.end(resolve));
  clearInterval(entry.timer);
  loggers.delete(filePath);
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
