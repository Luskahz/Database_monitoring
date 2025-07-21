import { addErro, addInfo } from "../../middleware/errorHandler.js";
import loggerMaster, { createLoggerController, loggerFileInit } from "../../middleware/logger.js";
import { insertHashInCache } from "../../model/cacheModel.js";
import { insertLog } from "../../model/logModel.js";
import createDataController from "../createDataController.js";
import fluxoValidatorController from "../fluxoValidatorController.js";
import { manageInsertController } from "../managerDataController.js";

export default async function createdHandler(filePath, action) {
//---------- criando os docs, e validando o fluxo de insersão -----------
let logger
try{
  logger = await loggerFileInit(filePath)
} catch(e){
  console.warn(e.message)
}
  let resultado;
  try {
    resultado = await createDataController(filePath);
  } catch (e) {
    addErro(`erro ao gerar os dados fundamentais, erro:${e.message}`);
    return;
  }
  const { metadados, logData } = resultado;

  if (!metadados || !logData) {
    addErro(`metadados ou logData não foram gerados corretamente`);
    return;
  }

  let fluxo;
  try {
    fluxo = await fluxoValidatorController(metadados, logData);
  } catch (e) {
    addErro(`Erro ao validar fluxo de ingestão: ${e.message}`);
    return;
  }

  
//-------------- vai retorna o logdata o metadados e o fluxo -----------


  if (fluxo === "inserir" || fluxo === "reprocessar") {
    let resultado;
    try {
      resultado = await manageInsertController(metadados)
      logData.sucesso = !resultado?.erro;
      logData.mensagem_erro = resultado?.mensagem || null;
      if (resultado?.erro) {
        addErro(logData.mensagem_erro);
      }
      await insertLog(logData);
      await insertHashInCache(logData);
      await loggerMaster(metadados, action);
    } catch (e) {
      logData.sucesso = false;
      logData.mensagem_erro = `Erro durante execução do managerDataController: ${e.message}`;

      addErro(`Erro durante execução do managerDataController: ${e.message}`);
      await insertLog(logData);
      await insertHashInCache(logData);
      await loggerMaster(metadados, action);
    }
  } else {
    addInfo(`[ARQUIVO IGNORADO] ${metadados.nome_arquivo} já existe e não foi modificado.`);
    return;
  }


}

