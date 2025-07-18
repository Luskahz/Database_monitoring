import fluxoValidatorController from "./fluxoValidatorController.js";
import { addInfo, addErro, addAviso } from "../middleware/errorHandler.js";
import { deleteLogByHash, insertLog } from "../model/logModel.js";
import { managerDataController } from "./managerDataController.js";
import createDataController, {
  destinoByFilePath,
} from "./createDataController.js";
import {
  deleteRegisterFromCache,
  getRegisterFromCache,
  insertHashInCache,
} from "../model/cacheModel.js";
import loggerMaster from "../middleware/logger.js";

export async function fileHandlerController(filePath, action) {
  const isInsertAction = ["created", "modified"].includes(action);
  if (isInsertAction) {
    let resultado
    try {
      resultado = await createDataController(filePath);
    } catch (e) {
      addErro(`erro ao gerar os dados fundamentais, erro:${e.message}`);
      return;
    }
    const { metadados, logData } = resultado
    if (!metadados || !logData) {
      addErro(`metadados ou logData não foram gerados corretamente`);
      return;
    }

    let fluxo;
    try {
      fluxo = await fluxoValidatorController(metadados, logData);
    } catch (e) {
      addErro(`Erro ao validar fluxo de ingestão: ${e.message}`);
      throw e;
    }
    if (fluxo === "inserir" || fluxo === "reprocessar") {
      let resultado;
      try {
        resultado = await managerDataController(metadados, action);
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
      addInfo(
        `[ARQUIVO IGNORADO] ${metadados.nome_arquivo} já existe e não foi modificado.`
      );
      return;
    }
  } else {
    const destino = destinoByFilePath(filePath);
    let logData;
    try {
      logData = await getRegisterFromCache(destino);
      if (!logData) {
        addAviso(`Nenhum registro de cache encontrado para ${filePath}`);
        return;
      }
    } catch (e) {
      addErro(`Erro ao extrair o logdata do cache, verifique o cache`)
    }
    let resultado;
    try {
      resultado = await managerDataController(logData, action);
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
}
