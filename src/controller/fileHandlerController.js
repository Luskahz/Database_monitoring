import fluxoValidatorController from "./fluxoValidatorController.js";
import { deleteHashInTable, insertLog } from "../model/logModel.js";
import { managerDataController } from "./managerDataController.js";
import createDataController, {
  createJsonController,
  destinoByFilePath,
} from "./createDataController.js";
import {
  deletRegisterFromCache,
  getRegisterFromCache,
  insertHashInCache,
} from "../model/cacheModel.js";
import path from "path";

export function isCsvFile(filePath) {
  const fileName = path.basename(filePath).toLowerCase();

  const isValidExtension =
    fileName.endsWith(".csv") || fileName.endsWith(".csv.inf");
  const isExcluded = fileName.startsWith("~$") || fileName.endsWith(".tmp");

  return isValidExtension && !isExcluded;
}

export async function fileHandlerController(filePath, action, next) {
  const isInsertAction = ["created", "modified"].includes(action);
  try {
    if (isInsertAction) {
      //cria os docs
      const dataJson = await createJsonController(filePath);
      if (dataJson && dataJson.length > 0) {
        const { metadados, logData } = await createDataController(
          filePath,
          dataJson,
          action
        );

        //define o fluxo
        const fluxo = await fluxoValidatorController(metadados, logData, next);

        //inicio do fluxo
        if (fluxo === "inserir" || fluxo === "reprocessar") {
          try {
            const resultado = await managerDataController(
              metadados,
              metadados.acao
            ); //realiza a inserção e espera erros ou não
            if (resultado?.erro) {
              // se houveram erros, ele loga
              logData.sucesso = false;
              logData.mensagem_erro =
                resultado.mensagem || "Erro durante a ingestão dos dados.";
            } else {
              logData.sucesso = true;
              logData.mensagem_erro = null;
            }

            await insertLog(logData);
            await insertHashInCache(logData);
          } catch (error) {
            logData.sucesso = false;
            logData.mensagem_erro =
              error.message || "Falha inesperada no controller.";
            await insertLog(logData);
            await insertHashInCache(logData);
            console.error(
              `Erro durante a execução do managerDataController:`,
              error.message
            );
          }
        } else {
          console.log(
            `\x1b[33m[ARQUIVO IGNORADO]\x1b[0m ${metadados.nome_arquivo} já existe e não foi modificado.`
          );
          // Opcional: registrar log com status "ignorado" no futuro
          return;
        }
      } else {
        console.error("o csv originou um json vazio");
      }

    } else {
      const destino = destinoByFilePath(filePath)
      const logData = await getRegisterFromCache(destino); 
      if (!logData) {
        console.warn(`⚠️ Nenhum registro de cache encontrado para ${filePath}`);
        return;
      }
      const resultado = await managerDataController(logData, action);
      if (resultado.erro === false) {
        try {
          await deleteHashInTable(logData);
          await deletRegisterFromCache(destino)
        } catch (error) {
          console.error(
            `problema ao apagar o hash do banco, erro: ${error.message}`
          );
        }
      }
    }
  } catch (error) {
    console.error(`Erro ao processar arquivo: ${error.message}`);
    throw error;
  }
}
