import { addAviso, addErro } from "../../middleware/errorHandler.js";
import {
  finalLoggerController,
  updateLoggerController,
} from "../../middleware/logger.js";
import {
  deleteRegisterFromCache,
  getRegisterFromCache,
} from "../../model/cacheModel.js";
import { deleteLogByHash } from "../../model/logModel.js";
import { destinoByFilePath } from "../createDataController.js";
import { managerDeleterController } from "../managerDataController.js";

export default async function deletedHandler(filePath, action) {
  try {
    const destino = destinoByFilePath(filePath);
    let logData;
    try {
      logData = await getRegisterFromCache(destino);
      if (!logData) {
        addAviso(`Nenhum registro de cache encontrado para ${filePath}`);
        await finalLoggerController(filePath)
        return;
      }
    } catch (e) {
      addErro(`Erro ao extrair o logdata do cache, verifique o cache`);
      await updateLoggerController(filePath)
    }
    let resultado;
    try {
      resultado = await managerDeleterController(logData);
      if (!resultado.erro) {
        await deleteLogByHash(logData);
        await deleteRegisterFromCache(destino);
        await updateLoggerController(filePath)
      }
    } catch (e) {
      addErro(`problema ao apagar o hash do banco, erro: ${e.message}`);
      await finalLoggerController(filePath)
      throw e;
    }
  } catch (e) {
    addErro(`Erro no deletedHandler, erro: ${e.message}, ${e.stack}`);
    await finalLoggerController(filePath);
    return;
  }
}
