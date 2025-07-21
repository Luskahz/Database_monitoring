import { addAviso, addErro } from "../../middleware/errorHandler.js"
import loggerMaster from "../../middleware/logger.js";
import {
  deleteRegisterFromCache,
  getRegisterFromCache,
} from "../../model/cacheModel.js";
import { deleteLogByHash } from "../../model/logModel.js";
import { destinoByFilePath } from "../createDataController.js";
import {
  managerDeleterController,
} from "../managerDataController.js";

export default async function deletedHandler(filePath, action) {
  const destino = destinoByFilePath(filePath);
  let logData;
  try {
    logData = await getRegisterFromCache(destino);
    if (!logData) {
      addAviso(`Nenhum registro de cache encontrado para ${filePath}`);
      return;
    }
  } catch (e) {
    addErro(`Erro ao extrair o logdata do cache, verifique o cache`);
  }
  let resultado;
  try {
    resultado = await managerDeleterController(logData);
    if (!resultado.erro) {
      await deleteLogByHash(logData);
      await deleteRegisterFromCache(destino);
      await loggerMaster(logData);
    }
  } catch (e) {
    addErro(`problema ao apagar o hash do banco, erro: ${e.message}`);
    throw e;
  }
}
