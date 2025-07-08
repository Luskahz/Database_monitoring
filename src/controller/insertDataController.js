import { insertRegisterinTable, deletePeriodoDispFromTable,  listPeriodoDispFromTable, insertValidator } from "../model/logModel.js";

export async function insertDataController(metadados) {
  const { data_json, tabela, coluna_data, mes, ano } = metadados;
  //list de todas as linhas da tabela
  const listFromTable = await listPeriodoDispFromTable(metadados);
  const validator = await insertValidator(listFromTable, data_json);

  if (validator === "substituir") {
    const result = await deletePeriodoDispFromTable(
      tabela,
      coluna_data,
      mes,
      ano
    );
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
