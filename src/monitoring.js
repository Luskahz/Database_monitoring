// monitoring/monitoring.js
import chokidar from "chokidar";
import path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import isCsvFile from "./utils/isCsvFile.js";
import createdHandler from "./controller/Handlers/createdHandler.js";
import deletedHandler from "./controller/Handlers/deletedHandler.js";
const __dirname = dirname(fileURLToPath(import.meta.url));

export function startMonitoring() {
  const monitorPath = path.resolve(__dirname, "\\\\192.168.0.213\\Files\\Logistica\\0.DPO\\Diretórios_SQL");

  const watcher = chokidar.watch(monitorPath, {
    persistent: true,
    ignoreInitial: false,
    usePolling: true,
    interval: 500,
    depth: 10,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100,
    },
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
        createdHandler(filePath, "created");
        
      }
    })
    .on("change", (filePath) => {
      if (isCsvFile(filePath)) {
        console.log(`🟡 Arquivo modificado: ${filePath}`);
        createdHandler(filePath, "modified");
      }
    })
    .on("unlink", (filePath) => {
      if (isCsvFile(filePath)) {
        console.log(`🔴 Arquivo removido: ${filePath}`);
        deletedHandler(filePath, "deleted");
      }
    })
    .on("error", (error) => {
      console.error(`❌ Erro no monitoramento: ${error}`);
      chokidarErrorHandler(error)
    })
    .on("ready", () => {
      console.log(`✅ Pronto! Monitorando alterações em: ${monitorPath}`);
    });
}
