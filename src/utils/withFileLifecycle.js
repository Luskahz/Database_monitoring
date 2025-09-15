import { startLogger, endLogger } from "../middleware/logger.js";
import { memoryGuard } from "./memoryGuard.js";
import { clearAllErrors } from "../middleware/errorHandler.js";

const activeFiles = new Set();
export function getActiveFilesCount() {
  return activeFiles.size;
}

export async function withFileLifecycle(filePath, fn) {
  startLogger(filePath);
  activeFiles.add(filePath);
  const off = memoryGuard.onChange(() => {});
  try {
    await fn();
  } finally {
    await endLogger(filePath);
    off();
    clearAllErrors(filePath);
    activeFiles.delete(filePath);
  }
}
