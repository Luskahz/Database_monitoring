// monitoring/monitoring.js
import chokidar from "chokidar";
import path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import chokidarErrorHandler from "./middleware/errorHandler.js";
import { fileHandlerController } from "./controller/fileHandlerController.js";
import { isCsvFile } from "./controller/fileHandlerController.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function startMonitoring() {
  const monitorPath = path.resolve(__dirname, "../..");
  let isReady = false;

  const watcher = chokidar.watch(monitorPath, {
    persistent: true,
    ignored: /[\\\/]database_monitoring[\\\/]/,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
  });

  watcher
    .on("add", (filePath) => {
      if (isCsvFile(filePath)) {
        console.log(`🟢 Arquivo adicionado: ${filePath}`);
        fileHandlerController(filePath, "created", chokidarErrorHandler);
      }
    })
    .on("change", (filePath) => {
      if (isCsvFile(filePath)) {
        console.log(`🟡 Arquivo modificado: ${filePath}`);
        fileHandlerController(filePath, "modified", chokidarErrorHandler);
      }
    })
    .on("unlink", (filePath) => {
      if (isCsvFile(filePath)) {
        console.log(`🔴 Arquivo removido: ${filePath}`);
        fileHandlerController(filePath, "deleted", chokidarErrorHandler);
      }
    })
    .on("error", (error) => {
      console.error(`❌ Erro no monitoramento: ${error}`);
      /* erro no monitoramento */
    })
    .on("ready", () => {
      console.log(`✅ Pronto! Monitorando alterações em: ${monitorPath}`);
      /* pronto para monitorar */
    });
}
