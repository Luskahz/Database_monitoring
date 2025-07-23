import { addErro, addInfo } from "../../middleware/errorHandler.js";
import {
  createLoggerController,
  finalLoggerController,
} from "../../middleware/logger.js";
import { insertHashInCache } from "../../model/cacheModel.js";
import { insertLog } from "../../model/logModel.js";
import createDataController from "../createDataController.js";
import fluxoValidatorController from "../fluxoValidatorController.js";
import { manageInsertController } from "../managerDataController.js";

export default async function createdHandler(filePath) {
  try {
    // ------------criando logger -----------------
    await createLoggerController(filePath);
    //---------- criando os docs, e validando o fluxo de insersão -----------

    let resultado;
    try {
      resultado = await createDataController(filePath);
    } catch (e) {
      addErro(`erro ao gerar os dados fundamentais, erro:${e.message}`);
      finalLoggerController(filePath);
      return;
    }
    const { metadados, logData } = resultado;

    if (!metadados || !logData) {
      addErro(`metadados ou logData não foram gerados corretamente`);
      finalLoggerController(filePath);
      return;
    }

    let fluxo;
    try {
      fluxo = await fluxoValidatorController(metadados, logData);
    } catch (e) {
      addErro(`Erro ao validar fluxo de ingestão: ${e.message}`);
      finalLoggerController(metadados);
      return;
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

        await insertLog(logData);
        await insertHashInCache(logData);
        await finalLoggerController(metadados);
      } catch (e) {
        logData.sucesso = false;
        logData.mensagem_erro = `Erro durante execução do managerDataController: ${e.message}`;
        addErro(`Erro durante execução do managerDataController: ${e.message}`);
        await insertLog(logData);
        await insertHashInCache(logData);
        await finalLoggerController(metadados);
      }
    } else {
      addInfo(
        `[ARQUIVO IGNORADO] ${metadados.nome_arquivo} já existe e não foi modificado.`
      );
      finalLoggerController(metadados);
      return;
    }
  } catch (e) {
    addErro(`erro no createdHandler, erro: ${e.message}`);
    await finalLoggerController(filePath);
    return;
  }
}
