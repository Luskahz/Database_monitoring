// monitoring/monitoring.js
import chokidar from "chokidar";
import path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import chokidarErrorHandler from "./middleware/errorHandler.js";
import { fileHandlerController, isCsvFile } from "./controller/fileHandlerController.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function startMonitoring() {
  const monitorPath = path.resolve(__dirname, "../../");
  let isReady = false;

  const watcher = chokidar.watch(monitorPath, {
    persistent: true,
    ignored: (filePath) => {
      const normalized = path.normalize(filePath);
      return normalized.includes("database_monitoring") || !isCsvFile(filePath);
    },
  });

  watcher
    .on("add", (filePath) => {
      console.log(`Arquivo adicionado: ${filePath}`);
      fileHandlerController(filePath, "created", chokidarErrorHandler);
    })
    .on("change", (filePath) => {
      console.log(`Arquivo modificado: ${filePath}`);
      fileHandlerController(filePath, "modified", chokidarErrorHandler);
    })
    .on("unlink", (filePath) => {
      console.log(`Arquivo removido: ${filePath}`);
      fileHandlerController(filePath, "deleted", chokidarErrorHandler);
    })
    .on("error", (error) => {
      console.error(`Erro no monitoramento: ${error}`);
      /* erro no monitoramento */
    })
    .on("ready", () => {
      console.log(`Monitoramento iniciado em: ${monitorPath}`);
      /* pronto para monitorar */
    });

  console.log(`Monitorando alterações em: ${monitorPath}`);
}
