import fluxoValidatorController from "./fluxoValidatorController.js";
import { insertLog } from "../model/tableModel.js";
import { insertDataController } from "./managerDataController.js";
import createDataController from "./createDataController.js";

export async function fileHandlerController(filePath, dataJson, action, next) {
  try {
    const { metadados, logData } = await createDataController(filePath, dataJson, action)
    const fluxo = await fluxoValidatorController(metadados.fileName, metadados.tabela, logData.hash_arquivo, next);

    if (fluxo === "inserir") {
      const insertTable = await insertDataController(metadados)
      const insertLogReturn = await insertLog(logData);
    } else if (fluxo === "reprocessar") {
      // logica de reprocessamento, caso o arquivo já exista mas tenha sido modificado
    } else {
      console.log(`\x1b[33m[ARQUIVO IGNORADO]\x1b[0m ${metadados.nome_arquivo} já existe e não foi modificado.`);
      return; // Se for ignorar, não faz nada por enquanto, depois faremos um log txt
    }
  } catch (error) {
    console.error(`Erro ao processar arquivo: ${error.message}`);
    throw error;
  }
}
