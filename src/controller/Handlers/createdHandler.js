import { addErro, addInfo, clearAllErrors } from "../../middleware/errorHandler.js";
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
  let metadados, logData
  try {
    // ------------criando logger -----------------
    clearAllErrors();
    await createLoggerController(filePath);
    //---------- criando os docs, e validando o fluxo de insersão -----------

    let resultado;
    try {
      resultado = await createDataController(filePath);
      ({ metadados, logData } = resultado);
    } catch (e) {
      addErro(`erro ao gerar os dados fundamentais, erro:${e.message}`);
      return;
    } finally {
      await updateLoggerController(getLoggerContext(metadados ?? {}, logData ?? {}, filePath));
    }
     

    if (!metadados || !logData) {
      addErro(`metadados ou logData não foram gerados corretamente`);
      await updateLoggerController(filePath);
      return;
    }

    let fluxo;
    try {
      fluxo = await fluxoValidatorController(metadados, logData);
    } catch (e) {
      addErro(`Erro ao validar fluxo de ingestão: ${e.message}`);
      return;
    } finally{
      await updateLoggerController(getLoggerContext(metadados ?? {}, logData ?? {}, filePath));
    }

    //-------------- vai retorna o logdata o metadados e o fluxo -----------

    if (fluxo === "inserir" || fluxo === "reprocessar") {
      let resultado;
      try {
        resultado = await manageInsertController(metadados);

        logData.sucesso = !resultado?.erro;
        logData.mensagem_erro = resultado?.mensagem || null;

        if (resultado?.erro) {
          addErro(logData.mensagem_erro);
        }
      } catch (e) {
        logData.sucesso = false;
        logData.mensagem_erro = `Erro durante execução do managerDataController: ${e.message}`;
        addErro(`Erro durante execução do managerDataController: ${e.message}`);
      } finally {
        await insertHashInCache(logData);
        await insertLog(logData);
        await updateLoggerController(getLoggerContext(metadados ?? {}, logData ?? {}, filePath));
      }
    } else {
      addInfo(
        `[ARQUIVO IGNORADO] ${metadados.nome_arquivo} já existe e não foi modificado.`
      );
      await updateLoggerController(getLoggerContext(metadados ?? {}, logData ?? {}, filePath));
      return;
    }
  } catch (e) {
    addErro(`erro no createdHandler, erro: ${e.message}, caminho do erro: ${e.stack}`);
    return;
  } finally {
    await finalLoggerController(getLoggerContext(metadados ?? {}, logData ?? {}, filePath));
  }
}
