import { addAviso, addErro } from "../../middleware/errorHandler.js";
import { deleteLogByHash, getLogWithFilePath } from "../../model/logModel.js";
import { destinoByFilePath } from "../createDataController.js";
import { managerDeleterController } from "../managerDataController.js";
import { withFileLifecycle } from "../../utils/withFileLifecycle.js";

export default async function deletedHandler(filePath, acao) {
  await withFileLifecycle(filePath, async () => {
    let logData = {};
    try {
      const destino = destinoByFilePath(filePath);
      try {
        logData = await getLogWithFilePath(filePath);
        if (!logData) {
          addErro(`Nenhum registro de log encontrado para ${filePath} logica de exclusão travada`, filePath);
          return;
        }
      } catch (e) {
        addErro(`Erro ao extrair o logdata do banco, verifique o banco`, filePath);
      }
      if (acao) {
        logData.acao = acao;
      }

      try {
        addAviso("logica de exclusão dos dados iniciada...", filePath);
        const resultado = await managerDeleterController(logData);
        addAviso("logica de exclusão dos dados finalizada...", filePath);
        if (resultado?.erro) {
          addErro(`Erro durante managerDeleterController: ${resultado.mensagem || "Erro desconhecido"}`, filePath);
          return;
        }
        await deleteLogByHash(logData);
      } catch (e) {
        addErro(`problema ao apagar o hash do banco, erro: ${e.message}`, filePath);
      }
    } catch (e) {
      addErro(`Erro no deletedHandler, erro: ${e.message}, ${e.stack}`, filePath);
    }
  });
}
