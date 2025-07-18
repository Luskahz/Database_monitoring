import {
  insertRegisterinTable,
  deletePeriodInTable,
  listPeriodInTable,
  deletePeriodInTableByMonth,
} from "../model/tableModel.js";

import { insertValidator } from "./insertValidator.js";
import tiparLinha from "../utils/tiparLinha.js";
import { addAviso, addErro } from "../middleware/errorHandler.js";

/**
 * @param {{
 *    nome_arquivo: string,
 *    ano: number,
 *    mes: string,
 *    tabela: string,
 *    data_json: object
 *    coluna_data: string,
 *    acao: string,
 *    colunas_tabela: object
 *    colunas_json: object
 *    tipos_esperados: object
 * }} objDinamico
 */
export async function managerDataController(objDinamico, action) {
  const isInsertAction = ["created", "modified"].includes(action);
  if (isInsertAction) {
    if (
      !Array.isArray(objDinamico.data_json) ||
      objDinamico.data_json.length === 0
    ) {
      addAviso("Nenhuma linha disponível para inserção.");
      return {
        erro: true,
        mensagem: "Nenhum dado encontrado para inserção.",
        detalhes_erro: "data_json vazio ou inválido.",
      };
    }
    let listFromTable;
    try {
      listFromTable = await listPeriodInTable(objDinamico);
    } catch (e) {
      addErro(`Erro ao consultar o período no banco: ${e.message}`);
      throw e;
    }
    const validator = insertValidator(listFromTable, objDinamico);

    const erros = [];
    let sucesso = 0;

    if (validator === "substituir") {
      try {
        await deletePeriodInTable(objDinamico);
      } catch (e) {
        addErro(
          `Erro ao deletar período antes da reinserção, erro: ${e.message}`
        );
        return {
          erro: true,
          mensagem: "Erro ao deletar período antes da reinserção",
          detalhes_erro: e.message,
        };
      }
    }

    for (let i = 0; i < objDinamico.data_json.length; i++) {
      try {
        const linhaTipada = tiparLinha(
          objDinamico.data_json[i],
          objDinamico.tipos_esperados
        );
        await insertRegisterinTable(objDinamico.tabela, linhaTipada);
        sucesso++;
      } catch (e) {
        addErro(`Erro ao inserir linha ${i}, erro: ${e.message}`);
        erros.push({
          linha: i,
          erro: e.message,
          dados: objDinamico.data_json[i],
        });
      }
    }

    return {
      erro: erros.length > 0,
      total: objDinamico.data_json.length,
      inseridos: sucesso,
      falhas: erros.length,
      mensagem: erros.length > 0 ? "Algumas linhas falharam" : null,
      detalhes_erros: erros,
    };
  } else {
    try {
      await deletePeriodInTableByMonth(objDinamico); //logData extraido do cache
      return {
        erro: false,
        mensagem: "periodo excluido com sucesso",
      };
    } catch (e) {
      addErro(
        `Erro ao deletar período no banco pós exclusão do arquivo, erro: ${e.message}`
      );
      return {
        erro: true,
        mensagem: "Erro ao deletar período no banco pós exclusão do arquivo",
        detalhes_erro: e.message,
      };
    }
  }
}
