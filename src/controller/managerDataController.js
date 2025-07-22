import {
  insertRegisterinTable,
  deletePeriodInTable,
  listPeriodInTable,
  deletePeriodInTableByMonth,
} from "../model/tableModel.js";

import { insertValidator } from "./insertValidator.js";
import tiparLinha from "../utils/tiparLinha.js";
import { addAviso, addErro } from "../middleware/errorHandler.js";
import { updateLoggerController } from "../middleware/logger.js";





export async function manageInsertController(metadados) {
  if (!Array.isArray(metadados.data_json) || metadados.data_json.length === 0) {
    addAviso("Nenhuma linha disponível para inserção.");
    return
  }

  let listFromTable;
  try {
    listFromTable = await listPeriodInTable(metadados);
  } catch (e) {
    addErro(`Erro ao consultar o período no banco: ${e.message}`);
    throw e;
  }

  const validator = insertValidator(listFromTable, metadados);
  const erros = [];
  let sucesso = 0;

  if (validator === "substituir") {
    try {
      await deletePeriodInTable(metadados);
    } catch (e) {
      addErro(
        `Erro ao deletar período antes da reinserção, erro: ${e.message}`
      );
      await updateLoggerController(metadados)
      return;
    }
  }

  for (let i = 0; i < metadados.data_json.length; i++) {
    try {
      const linhaTipada = tiparLinha(
        metadados.data_json[i],
        metadados.tipos_esperados
      );
      await insertRegisterinTable(metadados.tabela, linhaTipada);
      sucesso++;
    } catch (e) {
      addErro(`Erro ao inserir linha ${i}, erro: ${e.message}`);
      erros.push({
        linha: i,
        erro: e.message,
        dados: metadados.data_json[i],
      });
      await updateLoggerController(metadados)
    }
  }

  return {
    erro: erros.length > 0,
    total: metadados.data_json.length,
    inseridos: sucesso,
    falhas: erros.length,
    mensagem: erros.length > 0 ? "Algumas linhas falharam" : null,
    detalhes_erros: erros,
  };
}

export async function managerDeleterController(logData) {
  try {
    await deletePeriodInTableByMonth(logData); //logData extraido do cache
  } catch (e) {
    addErro(
      `Erro ao deletar período no banco pós exclusão do arquivo, erro: ${e.message}`
    );
    await updateLoggerController(metadados)
  }
}

