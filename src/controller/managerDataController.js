import {
  insertRegisterinTable,
  listPeriodInTable,
  deleteFromTable,
} from "../model/tableModel.js";

import { insertValidator } from "./insertValidator.js";
import tiparLinha from "../utils/tiparLinha.js";
import { addAviso, addErro, addInfo } from "../middleware/errorHandler.js";
import { updateLoggerController } from "../middleware/logger.js";

export async function manageInsertController(metadados) {
  if (!Array.isArray(metadados.data_json) || metadados.data_json.length === 0) {
    addAviso("Nenhuma linha disponível para inserção.");
    return;
  }

  let listFromTable;
  try {
    listFromTable = await listPeriodInTable(metadados); //caso a base seja cadastral, vai retornar null aqui se não, vai retornar um objeto com {dataCol: 'data da linha'}
  } catch (e) {
    addErro(`Erro ao consultar o período no banco: ${e.message}`);
    throw e;
  }

  const validator = await insertValidator(listFromTable, metadados);
  console.log(validator)
  const erros = [];
  let sucesso = 0;
  if (validator === "cadastro") {
    try {
      await deleteFromTable(metadados);
      addInfo(
        `[Delete dados] - dados excluidos, tabela do banco pronta pra reincersão dos novos dados cadastrais`
      );
    } catch (e) {
      addErro(
        `[delete tabela cadastro] - Erro ao deletar os dados do cadastro antes da reinserção, erro: ${e.message}`
      );
      await updateLoggerController(metadados);
      return;
    }
  } else if (validator === "substituir") {
    try {
      await deleteFromTable(metadados);
      addAviso(
        `[gerenciamento de inserções] operação de substituição, dados referente a data inserida foram excluidos`
      );
    } catch (e) {
      addErro(
        `Erro ao deletar período antes da reinserção, erro: ${e.message}`
      );
      await updateLoggerController(metadados);
      return;
    }
  }
  addInfo("iniciando processo de insersão dos dados na tabela...");
  const total = metadados.data_json.length;
  for (let i = 0; i < metadados.data_json.length; i++) {
    try {
      const linhaOriginal = metadados.data_json[i];
      const linhaTipada = tiparLinha(linhaOriginal, metadados.tipos_esperados);

      const { result, linhaTipada: linhaInserida } =
        await insertRegisterinTable(metadados.tabela, linhaTipada);
      // Log detalhado: original e tipada
      //console.log(
      //  `Linha ${i} inserida:\r\n`
      //    +`\r\n`+
      //    `Original: ${JSON.stringify(linhaOriginal)}\r\n`
      //    +`\r\n`+
      //    `Tipada:   ${JSON.stringify(linhaInserida)}\r\n`
      //    +`\r\n`+
      //    `----------------------------------------------`
      //);
      sucesso++;
      const porcentagem = (((i + 1) / total) * 100).toFixed(1);
      process.stdout.write(
        `\r📝 Inserindo dados... ${porcentagem}% (${i + 1}/${total})`
      );
    } catch (e) {
      addErro(`Erro ao inserir linha ${i}, erro: ${e.message}`);
      erros.push({
        linha: i,
        erro: e.message,
        dados: metadados.data_json[i],
      });
      await updateLoggerController(metadados);
    }
  }
  console.log(); // Move para a próxima linha depois do progresso
  addInfo("processo de insersão finalizado, validar caso erros");
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
    await deleteFromTable(logData);
    return { erro: false };
  } catch (e) {
    addErro(
      `Erro ao deletar período no banco pós exclusão do arquivo, erro: ${e.message}`
    );
    await updateLoggerController(logData.caminho_original);
    return { erro: true, mensagem: e.message };
  }
}
