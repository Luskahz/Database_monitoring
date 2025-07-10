import {
  insertRegisterinTable,
  deletePeriodoDispFromTable,
  listPeriodoDispFromTable,
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
  //list de todas as linhas da tabela
  const listFromTable = await listPeriodoDispFromTable(metadados);
  const validator = await insertValidator(listFromTable, metadados.data_json);

  if (validator === "substituir") {
    const result = await deletePeriodoDispFromTable(metadados.tabela ,metadados.coluna_data, metadados.mes, metadados.ano);
    if (!result.error) {
      const erros = [];
      let sucesso = 0;

      for (let i = 0; i < data_json.length; i++) {
        try {
          const result = await insertRegisterinTable(data_json[i], tabela);
          sucesso++;
        } catch (error) {
          console.error(`Erro ao inserir linha ${i}:`, error.message);

          erros.push({
            linha: i,
            erro: error.message,
            dados: data_json[i],
          });
        }
      }
      return {
        total: data_json.length,
        inseridos: sucesso,
        falhas: erros.length,
        detalhes_erros: erros,
      };
    }
  }
}
