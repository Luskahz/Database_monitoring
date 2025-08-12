// monitoring/monitoring.js
import chokidar from "chokidar";
import pLimit from "p-limit";
import path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import isCsvFile from "./utils/isCsvFile.js";
import createdHandler from "./controller/Handlers/createdHandler.js";
import deletedHandler from "./controller/Handlers/deletedHandler.js";
import { addErro } from "./middleware/errorHandler.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const limit = pLimit(50);

export async function startMonitoring() {
  const monitorPath = path.resolve(
    __dirname,
    "\\\\192.168.0.213\\Files\\Logistica\\0.DPO\\Diretórios_SQL"
  );

  const watcher = chokidar.watch(monitorPath, {
    persistent: true,
    ignoreInitial: true,
    usePolling: true,
    interval: 500,
    depth: 10,
    awaitWriteFinish: {
      stabilityThreshold: 10000,
      pollInterval: 500,
    },
    ignored: /[\\\/]database_monitoring[\\\/]/,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
  });

  watcher
    .on("add", async (filePath) => {
      if (isCsvFile(filePath)) {
        console.log(`🟢 Arquivo adicionado: ${filePath}`);
        limit(() => createdHandler(filePath, "created")).catch((e) => {
          console.log(
            `[monitoramento] Erro ao inserir arquivo cujo path é: ${filePath}, erro: ${e.message}`
          );
        });
      }
    })
    .on("change", async (filePath) => {
      if (isCsvFile(filePath)) {
        console.log(`🟡 Arquivo modificado: ${filePath}`);
        limit(() => createdHandler(filePath, "modified")).catch((e) => {
          console.log(
            `[monitoramento] Erro ao modificar arquivo cujo path é: ${filePath}, erro: ${e.message}`
          );
        });
      }
    })
    .on("unlink", async (filePath) => {
      if (isCsvFile(filePath)) {
        console.log(`🔴 Arquivo removido: ${filePath}`);
        limit(() => deletedHandler(filePath, "deleted")).catch((e) => {
          console.log(
            `[monitoramento] Erro ao apagar arquivo cujo path é: ${filePath}, erro: ${e.message}`
          );
        });
      }
    })
    .on("error", (error) => {
      console.error(`❌ Erro no monitoramento: ${error}`);
      addErro(`Erro no monitoramento, erro: ${error.message}`);
    })
    .on("ready", () => {
      console.log(`✅ Pronto! Monitorando alterações em: ${monitorPath}`);
    });
}
