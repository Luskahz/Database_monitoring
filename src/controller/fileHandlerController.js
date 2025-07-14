import fluxoValidatorController from "./fluxoValidatorController.js";
import { deleteHashInTable, insertLog } from "../model/logModel.js";
import { managerDataController } from "./managerDataController.js";
import createDataController from "./createDataController.js";
import { deletePeriodInTable } from "../model/tableModel.js";

export async function fileHandlerController(filePath, dataJson, action, next) {
  try {
    if (action === "created" || action === "modified") {
      const { metadados, logData } = await createDataController(
        filePath,
        dataJson,
        action
      ); // cria os docs
      const fluxo = await fluxoValidatorController(metadados, logData, next); //define o fluxo com base no arquivo

      if (fluxo === "inserir" || fluxo === "reprocessar") {
        //inicio do fluxo
        try {
          const resultado = await managerDataController(metadados); //realiza a inserção e espera erros ou não
          if (resultado?.erro) {
            // se houveram erros, ele loga
            logData.sucesso = false;
            logData.mensagem_erro =
              resultado.mensagem || "Erro durante a ingestão dos dados.";
          } else {
            logData.sucesso = true;
            logData.mensagem_erro = null;
          }

          await insertLog(logData); // log sempre, com status real
        } catch (error) {
          logData.sucesso = false;
          logData.mensagem_erro =
            error.message || "Falha inesperada no controller.";
          await insertLog(logData);
          console.error(
            `Erro durante a execução do managerDataController:`,
            error.message
          );
        }
      } else if (fluxo === "ignorar") {
        console.log(
          `\x1b[33m[ARQUIVO IGNORADO]\x1b[0m ${metadados.nome_arquivo} já existe e não foi modificado.`
        );
        // Opcional: registrar log com status "ignorado" no futuro
        return;
      }
    } else {
      const { metadados, logData } = await createDataController(
        filePath,
        dataJson,
        action
      );
      const hashValidator = await fluxoValidatorController(
        metadados,
        logData,
        next
      );

      if (hashValidator === "ignorar") {
        try {
          const deleted = await deletePeriodInTable(metadados);
          console.log("\x1b[32m✔ Período deletado com sucesso\x1b[0m");

          const hashDeleted = await deleteHashInTable(metadados);
          console.log("\x1b[32m✔ Hash deletado com sucesso\x1b[0m");
        } catch {
          console.error(
            "\x1b[31m❌ Erro durante o processo de deleção:\x1b[0m",
            error.message || error
          );
        }
      } else {
      }
    }
  } catch (error) {
    console.error(`Erro ao processar arquivo: ${error.message}`);
    throw error;
  }
}
