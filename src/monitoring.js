// monitoring/monitoring.js
import chokidar from "chokidar";
import pLimit from "p-limit";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import isCsvFile from "./utils/isCsvFile.js";
import createdHandler from "./controller/Handlers/createdHandler.js";
import deletedHandler from "./controller/Handlers/deletedHandler.js";
import { addErro } from "./middleware/errorHandler.js";
import { FILES_MAX_CONCURRENT } from "./utils/streamPipeline.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const limit = pLimit(FILES_MAX_CONCURRENT);
const bigLimit = pLimit(Math.min(FILES_MAX_CONCURRENT, 4));

const debounceTimers = new Map();

function runWithDebounce(filePath, acao, handler) {

  clearTimeout(debounceTimers.get(filePath));
  debounceTimers.set(
    filePath,
    setTimeout(() => {
      let chosen = limit;
      try {
        const stats = fs.statSync(filePath);
        const fileSizeMB = stats.size / (1024 * 1024);
        if (fileSizeMB >= 200) {
          chosen = bigLimit;
        }
      } catch {}
      chosen(() => handler(filePath, acao)).catch((e) => {
        console.log(
          `[monitoramento] Erro ao processar arquivo cujo path é: ${filePath}, erro: ${e.message}`
        );
      });
      debounceTimers.delete(filePath);
    }, 500)
  );
}

export async function startMonitoring() {
  const monitorPath = path.resolve(
    __dirname,
    "\\\\192.168.0.213\\Files\\Logistica\\0.DPO\\Diretórios_SQL"
  );

  const watcher = chokidar.watch(monitorPath, {
    persistent: true,
    ignoreInitial: true,
    usePolling: true,
    interval: 2000,
    depth: 10,
    ignored: [
      /[\\\/]database_monitoring[\\\/]/, 
      /[\\\/]loggers[\\\/]/,            
      /\.txt$/, 
    ],
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
  });

  watcher
    .on("add", (filePath) => {
      if (!isCsvFile(filePath)) return;
      console.log(`🟢 Arquivo adicionado: ${filePath}`);
      runWithDebounce(filePath, "created", createdHandler);
    })
    .on("change", (filePath) => {
      if (!isCsvFile(filePath)) return;
      console.log(`🟡 Arquivo modificado: ${filePath}`);
      runWithDebounce(filePath, "modified", createdHandler);
    })
    .on("unlink", (filePath) => {
      if (!isCsvFile(filePath)) return;
      console.log(`🔴 Arquivo removido: ${filePath}`);
      runWithDebounce(filePath, "deleted", deletedHandler);
    })
    .on("error", (error) => {
      console.error(`❌ Erro no monitoramento: ${error}`);
      addErro(`Erro no monitoramento, erro: ${error.message}`);
    })
    .on("ready", () => {
      console.log(`✅ Pronto! Monitorando alterações em: ${monitorPath}`);
    });
}

