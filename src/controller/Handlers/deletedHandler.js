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
  const contexto = filePath;

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
      addAviso("tentativa de extração do cache finalizada.", contexto);
      if (!logData) {
        addErro(
          `Nenhum registro de cache encontrado para ${filePath} logica de exclusão travada`,
          contexto
        );
        return;
      }
    } catch (e) {
      addErro(
        `Erro ao extrair o logdata do cache, verifique o cache`,
        contexto
      );
    } finally {
      await updateLoggerController(
        getLoggerContext({}, logData, filePath),
        contexto
      );
    }
    if (acao) {
      logData.acao = acao;
    }

    let resultado;
    try {
      addAviso("logica de exclusão dos dados iniciada...", contexto);
      resultado = await managerDeleterController(logData);
      addAviso("logica de exclusão dos dados finalizada...", contexto);
      if (resultado?.erro) {
        addErro(
          `Erro durante managerDeleterController: ${
            resultado.mensagem || "Erro desconhecido"
          }`,
          contexto
        );
        return; // ou `throw new Error(...)` dependendo da criticidade
      }
      await deleteLogByHash(logData);
    } catch (e) {
      addErro(
        `problema ao apagar o hash do banco, erro: ${e.message}`,
        contexto
      );
      return;
    } finally {
      await updateLoggerController(
        getLoggerContext({}, logData, filePath),
        contexto
      );
    }
  } catch (e) {
    addErro(`Erro no deletedHandler, erro: ${e.message}, ${e.stack}`, contexto);
    return;
  } finally {
    await finalLoggerController(
      getLoggerContext({}, logData, filePath),
      contexto
    );
  }
}
