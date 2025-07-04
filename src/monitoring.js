// monitoring/monitoring.js
import chokidar from "chokidar";
import path from "path";
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { receiver } from "./middleware/receiverMiddleware.js";

const __dirname = dirname(fileURLToPath(import.meta.url));


export function startMonitoring() {
  const monitorPath = path.resolve(__dirname, "../../"); // Caminho da pasta de arquivos

  const watcher = chokidar.watch(monitorPath, {
    persistent: true,
    ignored: /[\\\/]database_monitoring[\\\/]/,
  });

  watcher
    .on("add", (filePath) => {
      console.log(`Arquivo adicionado: ${filePath}`);
      receiver(filePath, "created")//recebe o caminho do arquivo e a ação do usuario
    })
    .on("change", (filePath) => {
      console.log(`Arquivo modificado: ${filePath}`);
    })
    .on("unlink", (filePath) => {
      console.log(`Arquivo removido: ${filePath}`);
      /* arquivo removido */
    })
    .on("addDir", (dirPath) => {
      console.log(`Pasta criada: ${dirPath}`);
      /* pasta criada */
    })
    .on("unlinkDir", (dirPath) => {
      console.log(`Pasta removida: ${dirPath}`);
      /* pasta removida */
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
