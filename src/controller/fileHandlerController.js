import fluxoValidatorController from "./fluxoValidatorController.js";
import { addInfo, addErro, addAviso } from "../middleware/errorHandler.js";
import { deleteLogByHash, insertLog } from "../model/logModel.js";
import { managerDataController } from "./managerDataController.js";
import createDataController, {
  createJsonController,
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
  try {
    if (isInsertAction) {
      let dataJson;
      try {
        dataJson = await createJsonController(filePath);
      } catch (e) {
        addErro(`Erro ao converter CSV para JSON: ${e.message}`);
        throw e;
      }

      if (dataJson && dataJson.length > 0) {
        let metadados, logData;
        try {
          ({ metadados, logData } = await createDataController(
            filePath,
            dataJson,
            action
          ));
        } catch (e) {
          addErro(`Erro ao gerar metadados e logData: ${e.message}`);
          throw e;
        }

        //define o fluxo
        let fluxo;
        try {
          fluxo = await fluxoValidatorController(metadados, logData);
        } catch (e) {
          addErro(`Erro ao validar fluxo de ingestão: ${e.message}`);
          throw e;
        }

        //inicio do fluxo
        if (fluxo === "inserir" || fluxo === "reprocessar") {
          try {
            const resultado = await managerDataController(
              metadados,
              metadados.acao
            );
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

            addErro(
              `Erro durante execução do managerDataController: ${e.message}`
            );
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
        addAviso(`O arquivo originou um JSON vazio.`);
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

        const resultado = await managerDataController(logData, action);
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
  } catch (e) {
    addErro(`[FATAL] Erro ao processar o arquivo '${filePath}': ${e.message}`);
    throw e;
  }
}
