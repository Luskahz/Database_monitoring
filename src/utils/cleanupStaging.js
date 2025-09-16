import fsp from "fs/promises";
import path from "path";

function getLogger(logger) {
  const noop = () => {};
  const info = logger?.info
    ? (msg) => {
        try {
          logger.info(msg);
        } catch (_) {}
      }
    : noop;
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
    : warn;
  return { info, warn, error };
}

export async function cleanupStaging({
  stagingDir,
  ttlMinutes,
  logger,
} = {}) {
  if (!stagingDir) return { removed: 0, scanned: 0 };
  const ttlMs = Math.max(0, Number(ttlMinutes) || 0) * 60 * 1000;
  if (ttlMs <= 0) return { removed: 0, scanned: 0 };

  const log = getLogger(logger);

  let dirHandle;
  let removed = 0;
  let scanned = 0;

  try {
    dirHandle = await fsp.opendir(stagingDir);
  } catch (err) {
    if (err?.code === "ENOENT") return { removed: 0, scanned: 0 };
    log.warn(`[Staging] cleanup falhou ao abrir diretório (${stagingDir}): ${err.message}`);
    return { removed: 0, scanned: 0 };
  }

  const now = Date.now();
  const staleBefore = now - ttlMs;

  try {
    for await (const dirent of dirHandle) {
      if (!dirent || !dirent.isFile?.()) continue;
      scanned += 1;
      const filePath = path.join(stagingDir, dirent.name);
      try {
        const stats = await fsp.stat(filePath);
        if (stats.mtimeMs < staleBefore) {
          await fsp.unlink(filePath);
          removed += 1;
        }
      } catch (err) {
        if (err?.code === "ENOENT") continue;
        log.warn(`[Staging] cleanup falhou para ${filePath}: ${err.message}`);
      }
    }
  } finally {
    await dirHandle.close().catch(() => {});
  }

  if (removed > 0) {
    log.info(`[Staging] cleanup removeu ${removed} arquivos antigos (${scanned} verificados)`);
  }

  return { removed, scanned };
}

