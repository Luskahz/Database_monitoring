import { addAviso, addErro, clearAllErrors } from "../../middleware/errorHandler.js";
import {
  finalLoggerController,
  getLoggerContext,
  updateLoggerController,
} from "../../middleware/logger.js";
import {
  deleteRegisterFromCache,
  getRegisterFromCache,
} from "../../model/cacheModel.js";
import { deleteLogByHash } from "../../model/logModel.js";
import { destinoByFilePath } from "../createDataController.js";
import { managerDeleterController } from "../managerDataController.js";

export default async function deletedHandler(filePath) {
  clearAllErrors()
  let logData;
  try {
    const destino = destinoByFilePath(filePath);
    try {
      logData = await getRegisterFromCache(destino);
      addAviso("tentativa de extração do cache finalizada.");
      if (!logData) {
        addErro(
          `Nenhum registro de cache encontrado para ${filePath} logica de exclusão travada`
        );
        return;
      }
    } catch (e) {
      addErro(`Erro ao extrair o logdata do cache, verifique o cache`);
    } finally {
      await updateLoggerController(getLoggerContext({}, logData, filePath));
    }
    let resultado;
    try {
      addAviso("logica de exclusão dos dados iniciada...");
      resultado = await managerDeleterController(logData);
      addAviso("logica de exclusão dos dados finalizada...");
      if (resultado?.erro) {
        addErro(
          `Erro durante managerDeleterController: ${
            resultado.mensagem || "Erro desconhecido"
          }`
        );
        return; // ou `throw new Error(...)` dependendo da criticidade
      }
      await deleteLogByHash(logData);
      await deleteRegisterFromCache(destino);
      addAviso("exclusão do log no cache e no banco finalizadas");
    } catch (e) {
      addErro(
        `problema ao apagar o hash do banco ou do cache, erro: ${e.message}`
      );
      return;
    } finally {
      await updateLoggerController(getLoggerContext({}, logData, filePath));
    }
  } catch (e) {
    addErro(`Erro no deletedHandler, erro: ${e.message}, ${e.stack}`);
    return;
  } finally {
    
    await finalLoggerController(getLoggerContext({}, logData, filePath));
  }
}
