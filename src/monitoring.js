// monitoring/monitoring.js
import chokidar from "chokidar";
import pLimit from "p-limit";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

import createdHandler from "./controller/Handlers/createdHandler.js";
import deletedHandler from "./controller/Handlers/deletedHandler.js";
import { addErro } from "./middleware/errorHandler.js";
import isCsvFile from "./utils/isCsvFile.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Limita concorrência global e serializa eventos por arquivo
const limit = pLimit(50);
const filaPorArquivo = new Map();

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
    ignored: /[\\\/]database_monitoring[\\\/]/,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
  });

  function enfileirar(filePath, acao, handler) {
    if (!isCsvFile(filePath)) return;

    const prev = filaPorArquivo.get(filePath) || Promise.resolve();
    const exec = prev
      .catch(() => {})
      .then(() =>
        limit(() => handler(filePath, acao)).catch((e) => {
          console.log(
            `[monitoramento] Erro ao processar arquivo cujo path é: ${filePath}, erro: ${e.message}`
          );
        })
      )
      .finally(() => {
        if (filaPorArquivo.get(filePath) === exec) filaPorArquivo.delete(filePath);
      });

    filaPorArquivo.set(filePath, exec);
  }

  watcher
    .on("add", (filePath) => {
      console.log(`🟢 Arquivo adicionado: ${filePath}`);
      enfileirar(filePath, "created", createdHandler);
    })
    .on("change", (filePath) => {
      console.log(`🟡 Arquivo modificado: ${filePath}`);
      enfileirar(filePath, "modified", createdHandler);
    })
    .on("unlink", (filePath) => {
      console.log(`🔴 Arquivo removido: ${filePath}`);
      enfileirar(filePath, "deleted", deletedHandler);
    })
    .on("error", (error) => {
      console.error(`❌ Erro no monitoramento: ${error}`);
      addErro(`Erro no monitoramento, erro: ${error.message}`);
    })
    .on("ready", () => {
      console.log(`✅ Pronto! Monitorando alterações em: ${monitorPath}`);
    });
}
