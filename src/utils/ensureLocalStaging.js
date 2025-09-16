import fsp from "fs/promises";
import os from "os";
import path from "path";
import { pipeline } from "stream/promises";
import { createReadStream, createWriteStream } from "fs";
import { performance } from "node:perf_hooks";

const DEFAULT_MAX_TOTAL_DELAY_MS = 30_000;
const RETRY_DELAYS_MS = [200, 500, 1000, 2000, 5000];
const DEFAULT_STABILITY_INTERVAL_MS = 500;
const DEFAULT_STABILITY_ROUNDS = 2;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultStagingDir() {
  return path.join(os.tmpdir(), "database_monitoring", "staging");
}

function normalizeBoolean(value, defaultValue) {
  if (value == null) return defaultValue;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (!s) return defaultValue;
    if (["1", "true", "yes", "sim", "y"].includes(s)) return true;
    if (["0", "false", "no", "nao", "não", "n"].includes(s)) return false;
  }
  return defaultValue;
}

function normalizeNumber(value, defaultValue) {
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultValue;
}

export function isRemotePath(p) {
  if (typeof p !== "string" || p.length === 0) return false;
  if (p.startsWith("\\\\?\\")) {
    const tail = p.slice(4).toUpperCase();
    if (tail.startsWith("UNC\\")) return true;
    return false;
  }
  if (p.startsWith("\\\\")) return true;
  if (p.startsWith("//")) {
    const rest = p.slice(2);
    if (!rest) return false;
    return !rest.startsWith("/");
  }
  return false;
}

function getLogger(logger) {
  const noop = () => {};
  const info = logger?.info ? (msg) => {
    try {
      logger.info(msg);
    } catch (_) {}
  } : noop;
  const warn = logger?.warn
    ? (msg) => {
        try {
          logger.warn(msg);
        } catch (_) {}
      }
    : info;
  const error = logger?.error
    ? (msg) => {
        try {
          logger.error(msg);
        } catch (_) {}
      }
    : info;
  return { info, warn, error };
}

async function safeStat(p, allowNotFound = false) {
  try {
    return await fsp.stat(p);
  } catch (err) {
    if (allowNotFound && (err?.code === "ENOENT" || err?.code === "ENOTDIR")) {
      return null;
    }
    throw err;
  }
}

function shouldRetry(err) {
  if (!err) return false;
  const retryable = new Set([
    "EBUSY",
    "EPERM",
    "EACCES",
    "EMFILE",
    "ENFILE",
    "EIO",
    "ETXTBSY",
  ]);
  if (retryable.has(err.code)) return true;
  if (err.code === "EINVAL" && err.syscall === "open") return true;
  return false;
}

function shouldFallbackToStream(err) {
  if (!err) return false;
  return ["ERR_FS_FILE_TOO_LARGE", "ENOSYS", "EXDEV", "ENOTSUP"].includes(err.code);
}

async function copyViaStream(src, dest, highWaterMark = 8 * 1024 * 1024) {
  await pipeline(
    createReadStream(src, { highWaterMark }),
    createWriteStream(dest, { highWaterMark })
  );
  return "stream";
}

async function attemptCopy(src, dest) {
  try {
    await fsp.copyFile(src, dest);
    return "copyFile";
  } catch (err) {
    if (shouldFallbackToStream(err)) {
      return await copyViaStream(src, dest);
    }
    throw err;
  }
}

async function ensureDir(dir) {
  if (!dir) return;
  await fsp.mkdir(dir, { recursive: true });
}

async function waitForStableFile(srcPath, { logger, intervalMs, rounds }) {
  const log = getLogger(logger);
  const stableRounds = Math.max(1, rounds | 0);
  let prev = await safeStat(srcPath);
  if (!prev) throw new Error(`Arquivo de origem não encontrado: ${srcPath}`);
  let stableCount = 0;
  for (let i = 0; i < 10; i++) {
    await sleep(intervalMs);
    const next = await safeStat(srcPath);
    if (!next) throw new Error(`Arquivo de origem inacessível: ${srcPath}`);
    if (next.size === prev.size && Math.abs(next.mtimeMs - prev.mtimeMs) < 1) {
      stableCount += 1;
      if (stableCount >= stableRounds) {
        return next;
      }
    } else {
      stableCount = 0;
      log.info(
        `[Staging] aguardando estabilizar: size mudou de ${prev.size} para ${next.size} bytes`
      );
    }
    prev = next;
  }
  log.warn("[Staging] estabilidade não confirmada após múltiplas tentativas, prosseguindo assim mesmo");
  return prev;
}

async function ensureDiskSpace(dir, requiredBytes, minFreeMb, logger) {
  if (!(minFreeMb > 0)) return;
  if (!dir) return;
  if (typeof fsp.statfs !== "function") {
    getLogger(logger).warn(
      `[Staging] statfs indisponível para verificar espaço em disco, prosseguindo sem validação`
    );
    return;
  }
  try {
    const stats = await fsp.statfs(dir);
    const freeBytes = Number(stats?.bavail) * Number(stats?.bsize);
    if (!Number.isFinite(freeBytes)) return;
    const freeMb = freeBytes / (1024 * 1024);
    if (freeMb < minFreeMb) {
      const message = `Espaço insuficiente no staging (${freeMb.toFixed(1)}MB disponível, requer ${minFreeMb}MB)`;
      throw new Error(message);
    }
    if (requiredBytes && freeBytes < requiredBytes) {
      const needMb = (requiredBytes / (1024 * 1024)).toFixed(1);
      const msg = `Espaço insuficiente no staging (necessário ${needMb}MB, disponível ${freeMb.toFixed(1)}MB)`;
      throw new Error(msg);
    }
  } catch (err) {
    if (err?.code === "ENOENT") return;
    if (err?.code === "ENOSYS") {
      getLogger(logger).warn(
        `[Staging] statfs não suportado ao verificar espaço em disco, prosseguindo`
      );
      return;
    }
    throw err;
  }
}

function buildDeterministicName(srcPath, stats) {
  const parsed = path.parse(srcPath);
  const base = parsed.name || "arquivo";
  const ext = parsed.ext || ".csv";
  const sizePart = Number(stats?.size ?? 0);
  const mtimePart = Math.floor(Number(stats?.mtimeMs ?? 0));
  const safeBase = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${safeBase}.${sizePart}.${mtimePart}${ext}`;
}

function computeRetryDelay(attempt) {
  if (attempt < RETRY_DELAYS_MS.length) return RETRY_DELAYS_MS[attempt];
  return RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
}

export async function ensureLocalStaging({
  srcPath,
  stagingDir = process.env.STAGING_DIR || defaultStagingDir(),
  reuse = normalizeBoolean(process.env.STAGING_REUSE, true),
  verify = normalizeBoolean(process.env.STAGING_VERIFY, true),
  logger,
} = {}) {
  if (!srcPath || typeof srcPath !== "string") {
    throw new Error("Caminho de origem inválido para staging");
  }

  const log = getLogger(logger);
  const remote = isRemotePath(srcPath);

  if (!remote) {
    log.info(`[Staging] origem local detectada, uso direto do arquivo (${srcPath})`);
    return {
      effectivePath: srcPath,
      copied: false,
      reused: false,
      isRemote: false,
      bytes: 0,
      durationMs: 0,
      retries: 0,
      method: null,
      verify,
      stagingDir,
    };
  }

  const start = performance.now();
  const stabilityInterval = normalizeNumber(
    process.env.STAGING_STABILITY_INTERVAL_MS,
    DEFAULT_STABILITY_INTERVAL_MS
  );
  const stabilityRounds = normalizeNumber(
    process.env.STAGING_STABILITY_ROUNDS,
    DEFAULT_STABILITY_ROUNDS
  );
  const minFreeMb = normalizeNumber(process.env.STAGING_DISK_MIN_MB, 0);

  log.info(
    `[Staging] início | src="${srcPath}" | stagingDir="${stagingDir}" | reuse=${reuse} | verify=${verify}`
  );

  await ensureDir(stagingDir);

  const srcStats = await waitForStableFile(srcPath, {
    logger,
    intervalMs: Math.max(100, stabilityInterval),
    rounds: Math.max(1, stabilityRounds),
  });

  await ensureDiskSpace(stagingDir, srcStats.size, minFreeMb, logger);

  const fileName = buildDeterministicName(srcPath, srcStats);
  const destPath = path.join(stagingDir, fileName);

  if (reuse) {
    const existing = await safeStat(destPath, true);
    if (existing && existing.size === srcStats.size) {
      log.info(
        `[Staging] reutilizando cópia existente (${destPath}) | bytes=${existing.size}`
      );
      return {
        effectivePath: destPath,
        copied: false,
        reused: true,
        isRemote: true,
        bytes: existing.size,
        durationMs: performance.now() - start,
        retries: 0,
        method: "reuse",
        verify,
        stagingDir,
      };
    }
  }

  const tempPath = destPath + ".tmp-" + process.pid;
  let attempt = 0;
  let retries = 0;
  let lastError = null;
  let method = "copyFile";
  let totalDelay = 0;

  while (true) {
    try {
      await ensureDir(path.dirname(destPath));
      await fsp.unlink(destPath).catch(() => {});
      method = await attemptCopy(srcPath, tempPath);
      await fsp.utimes(tempPath, srcStats.atime ?? new Date(), srcStats.mtime ?? new Date());
      await fsp.rename(tempPath, destPath);
      break;
    } catch (err) {
      lastError = err;
      try {
        await fsp.unlink(tempPath);
      } catch (_) {}
      if (!shouldRetry(err) || totalDelay >= DEFAULT_MAX_TOTAL_DELAY_MS) {
        log.error(`[Staging] falha ao copiar arquivo: ${err?.message || err}`);
        throw err;
      }
      const delay = computeRetryDelay(attempt);
      totalDelay += delay;
      retries += 1;
      log.warn(
        `[Staging] tentativa ${attempt + 1} falhou (${err?.code || err?.message}); aguardando ${delay}ms para retry`
      );
      await sleep(delay);
      attempt += 1;
    }
  }

  const destStats = await safeStat(destPath);
  if (!destStats) {
    const err = new Error("Falha ao localizar cópia após staging");
    log.error(`[Staging] ${err.message}`);
    throw err;
  }

  if (verify) {
    if (destStats.size !== srcStats.size) {
      const err = new Error(
        `Verificação falhou: bytes diferentes (origem=${srcStats.size}, cópia=${destStats.size})`
      );
      log.error(`[Staging] ${err.message}`);
      await fsp.unlink(destPath).catch(() => {});
      throw err;
    }
  }

  const durationMs = performance.now() - start;
  log.info(
    `[Staging] concluído | work="${destPath}" | bytes=${destStats.size} | duration=${durationMs.toFixed(0)}ms | retries=${retries} | method=${method}`
  );

  return {
    effectivePath: destPath,
    copied: true,
    reused: false,
    isRemote: true,
    bytes: destStats.size,
    durationMs,
    retries,
    method,
    verify,
    stagingDir,
    lastError,
  };
}

