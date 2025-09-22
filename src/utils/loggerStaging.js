import fs from "fs";
import path from "path";
import { copyFile, mkdir, unlink, writeFile } from "fs/promises";
import { isRemotePath } from "./ensureLocalStaging.js";

const LOCAL_LOG_DIR = path.resolve(process.cwd(), "staging_loggers");
fs.mkdirSync(LOCAL_LOG_DIR, { recursive: true });

export function getLogBaseName(filePath) {
  if (!filePath) return "log";
  const parsed = path.parse(filePath);
  return parsed.name || path.basename(filePath) || "log";
}

export function shouldStageLogger(filePath) {
  return isRemotePath(filePath);
}

export async function setupStagedLogger(filePath) {
  if (!shouldStageLogger(filePath)) return null;

  const baseName = getLogBaseName(filePath);
  const localLogPath = path.join(LOCAL_LOG_DIR, `Logger_${baseName}.txt`);

  await mkdir(LOCAL_LOG_DIR, { recursive: true });

  const networkLogDir = path.join(path.dirname(filePath), "loggers");
  await mkdir(networkLogDir, { recursive: true });

  const startPlaceholder = path.join(
    networkLogDir,
    `Logger_${baseName}_processamento_iniciado.txt`
  );
  const stamp = new Date().toISOString();
  await writeFile(startPlaceholder, `Processamento iniciado em ${stamp}\n`);

  return { baseName, localLogPath, networkLogDir, startPlaceholder };
}

export async function finalizeStagedLogger(stagedInfo, options = {}) {
  if (!stagedInfo) return null;

  const { skipCopy = false } = options;
  const { baseName, localLogPath, networkLogDir, startPlaceholder } = stagedInfo;
  let finalPath = null;

  try {
    if (!skipCopy && localLogPath && networkLogDir) {
      finalPath = path.join(networkLogDir, `Logger_${baseName}.txt`);
      await copyFile(localLogPath, finalPath);
    }
  } finally {
    if (startPlaceholder) {
      await unlink(startPlaceholder).catch(() => {});
    }
  }

  return finalPath;
}

export { LOCAL_LOG_DIR };
