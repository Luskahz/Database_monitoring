import { addAviso, addErro } from "../../middleware/errorHandler.js";
import {
  finalLoggerController,
  getLoggerContext,
  updateLoggerController,
  createLoggerController,
} from "../../middleware/logger.js";
import { deleteLogByHash, getLogWithFilePath } from "../../model/logModel.js";
import { destinoByFilePath } from "../createDataController.js";
import { managerDeleterController } from "../managerDataController.js";



export default async function deletedHandler(filePath, acao) {

  try {
    await createLoggerController(filePath);
  } catch (e) {
    console.error("[Logger] falha ao criar logger de delete:", e);
  }
  let logData = {};
  try {
    const destino = destinoByFilePath(filePath);
    try {
      logData = await getLogWithFilePath(filePath);
      if (!logData) { addErro( `Nenhum registro de log encontrado para ${filePath} logica de exclusão travada`, filePath ); return; }
    } catch (e) {
      addErro( `Erro ao extrair o logdata do banco, verifique o banco`, filePath );
    }
    if (acao) {
      logData.acao = acao;
    }

    let resultado;
    try {
      addAviso("logica de exclusão dos dados iniciada...", filePath);
      resultado = await managerDeleterController(logData);
      addAviso("logica de exclusão dos dados finalizada...", filePath);
      if (resultado?.erro) {
        addErro( `Erro durante managerDeleterController: ${ resultado.mensagem || "Erro desconhecido" }`, filePath ); return; }
      await deleteLogByHash(logData);
    } catch (e) {
      addErro( `problema ao apagar o hash do banco, erro: ${e.message}`, filePath );
      return;
    }
  } catch (e) {
    addErro(`Erro no deletedHandler, erro: ${e.message}, ${e.stack}`, filePath);
    return;
  } finally {
    await updateLoggerController( getLoggerContext({}, logData, filePath), filePath );
    await finalLoggerController(getLoggerContext({}, logData, filePath), filePath );
  }
}
