import {
  insertRegisterinTable,
  deletePeriodInTable,
  listPeriodInTable,
  insertValidator,
  deletePeriodInTableByMonth,
} from "../model/tableModel.js";

import { tiparLinha } from "../model/createSchemaMode.js";

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
    const listFromTable = await listPeriodInTable(objDinamico);
    const validator = insertValidator(listFromTable, objDinamico);
    const erros = [];
    let sucesso = 0;

    if (validator === "substituir") {
      try {
        await deletePeriodInTable(objDinamico);
      } catch (error) {
        console.error(
          "Erro ao deletar período antes da reinserção:",
          error.message
        );
        return {
          erro: true,
          mensagem: "Erro ao deletar período antes da reinserção",
          detalhes_erro: error.message,
        };
      }
    }

    for (let i = 0; i < objDinamico.data_json.length; i++) {
      try {
        const linhaTipada = await tiparLinha(
          objDinamico.data_json[i],
          objDinamico.tipos_esperados
        );
        await insertRegisterinTable(objDinamico.tabela, linhaTipada);
        sucesso++;
      } catch (error) {
        console.error(`Erro ao inserir linha ${i}:`, error.message);
        erros.push({
          linha: i,
          erro: error.message,
          dados: objDinamico.data_json[i],
        });
      }
    }

    return {
      total: objDinamico.data_json.length,
      inseridos: sucesso,
      falhas: erros.length,
      detalhes_erros: erros,
    };
  } else {
    try {
      await deletePeriodInTableByMonth(objDinamico);//logData extraido do cache
      return {
        erro: false,
        mensagem: "periodo excluido"
      };
    } catch (error) {
      console.error(
        "Erro ao deletar período no banco pós exclusão do arquivo",
        error.message
      );
      return {
        erro: true,
        mensagem: "Erro ao deletar período no banco pós exclusão do arquivo",
        detalhes_erro: error.message,
      };
    }
  }
}
