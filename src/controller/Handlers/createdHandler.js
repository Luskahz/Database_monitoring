import {
  addErro,
  addInfo,
  clearAllErrors,
} from "../../middleware/errorHandler.js";
import {
  createLoggerController,
  finalLoggerController,
  getLoggerContext,
  updateLoggerController,
} from "../../middleware/logger.js";
import { insertHashInCache } from "../../model/cacheModel.js";
import { insertLog } from "../../model/logModel.js";
import createDataController from "../createDataController.js";
import fluxoValidatorController from "../fluxoValidatorController.js";
import { manageInsertController } from "../managerDataController.js";

export default async function createdHandler(filePath) {
  if (!filePath) {
    addErro(
      "caminho do arquivo não definido no handler, sem como identificar qual arquivo deu erro..."
    );
    return;
  }
  const contexto = filePath;
  let metadados, logData;
  try {
    // ------------criando logger -----------------
    clearAllErrors(contexto);
    await createLoggerController(filePath);

    //---------- criando os docs, e validando o fluxo de insersão -----------

    try {
      
      ({ metadados, logData } = await createDataController(filePath));
    } catch (e) {
      addErro(
        `erro ao gerar os dados fundamentais, erro:${e.message}`,
        contexto
      );
      return;
    } finally {
      await updateLoggerController(
        getLoggerContext(metadados ?? {}, logData ?? {}, filePath),
        contexto
      );
    }

    if (!metadados || !logData) {
      addErro(`metadados ou logData não foram gerados corretamente`, contexto);
      await updateLoggerController(
        getLoggerContext(metadados ?? {}, logData ?? {}, filePath),
        contexto
      );
      return;
    }

    let fluxo;
    try {
      fluxo = await fluxoValidatorController(metadados, logData);
    } catch (e) {
      addErro(`Erro ao validar fluxo de ingestão: ${e.message}`, contexto);
      return;
    } finally {
      await updateLoggerController(
        getLoggerContext(metadados ?? {}, logData ?? {}, filePath),
        contexto
      );
    }

    //-------------- vai retorna o logdata o metadados e o fluxo -----------

    if (fluxo === "inserir" || fluxo === "reprocessar") {
      let resultado;
      try {
        resultado = await manageInsertController(metadados);

        logData.sucesso = !resultado?.erro;
        logData.mensagem_erro = resultado?.mensagem || null;

        if (resultado?.erro) {
          addErro(logData.mensagem_erro, contexto);
        }
      } catch (e) {
        logData.sucesso = false;
        logData.mensagem_erro = `Erro durante execução do managerDataController: ${e.message}`;
        addErro(
          `Erro durante execução do managerDataController: ${e.message}`,
          contexto
        );
      } finally {
        await insertHashInCache(logData);
        await insertLog(logData);
        await updateLoggerController(
          getLoggerContext(metadados ?? {}, logData ?? {}, filePath),
          contexto
        );
      }
    } else {
      addInfo(
        `[ARQUIVO IGNORADO] ${metadados.nome_arquivo} já existe e não foi modificado.`,
        contexto
      );
      await updateLoggerController(
        getLoggerContext(metadados ?? {}, logData ?? {}, filePath),
        contexto
      );
      return;
    }
  } catch (e) {
    addErro(
      `erro no createdHandler, erro: ${e.message}, caminho do erro: ${e.stack}`,
      contexto
    );
    return;
  } finally {
    await finalLoggerController(
      getLoggerContext(metadados ?? {}, logData ?? {}, filePath),
      contexto
    );
  }
}
