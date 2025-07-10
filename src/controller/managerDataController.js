import {
  insertRegisterinTable,
  deletePeriodInTable,
  listPeriodInTable,
  insertValidator,
} from "../model/tableModel.js";

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
 * }} metadados
 */
export async function managerDataController(metadados) {
  const listFromTable = await listPeriodInTable(metadados);
  const validator = await insertValidator(listFromTable, metadados);

  const erros = [];
  let sucesso = 0;

  // Se for para substituir, primeiro deleta o período
  if (validator === "substituir") {
    try {
      await deletePeriodInTable(metadados);
    } catch (error) {
      console.error("Erro ao deletar período:", error.message);
      return {
        erro: true,
        mensagem: "Erro ao deletar período antes da reinserção",
        detalhes_erro: error.message,
      };
    }
  }

  // Independente do modo, sempre insere
  for (let i = 0; i < metadados.data_json.length; i++) {
    try {
      await insertRegisterinTable(metadados, i);
      sucesso++;
    } catch (error) {
      console.error(`Erro ao inserir linha ${i}:`, error.message);
      erros.push({
        linha: i,
        erro: error.message,
        dados: metadados.data_json[i],
      });
    }
  }

  return {
    total: metadados.data_json.length,
    inseridos: sucesso,
    falhas: erros.length,
    detalhes_erros: erros,
  };
}


