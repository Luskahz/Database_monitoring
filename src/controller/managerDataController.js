import {
  insertRegisterinTable,
  listPeriodInTable,
  deleteFromTable,
} from "../model/tableModel.js";
import {
  iniciarBarra,
  atualizarBarra,
  finalizarBarra,
} from "../utils/progressBar.js";

import { insertValidator } from "./insertValidator.js";
import { addAviso, addErro, addInfo } from "../middleware/errorHandler.js";
import { updateLoggerController } from "../middleware/logger.js";
import { streamCsvRows } from "../utils/csvStream.js";
import tiparLinha from "../utils/tiparLinha.js";

export async function manageInsertController(metadados) {
  const contexto = metadados.caminho_original;
  const nomeArquivo = metadados.nome_arquivo ?? "arquivo-desconhecido";
  if (!metadados.total_linhas || metadados.total_linhas === 0) {
    addAviso("Nenhuma linha disponível para inserção.", contexto);
    return;
  }

  let listFromTable;
  try {
    listFromTable = await listPeriodInTable(metadados);
  } catch (e) {
    addErro(`Erro ao consultar o período no banco: ${e.message}`, contexto);
    throw e;
  }

  const validator = await insertValidator(listFromTable, metadados);
  const erros = [];
  let sucesso = 0;
  if (validator === "cadastro") {
    try {
      await deleteFromTable(metadados);
      addInfo(
        `[Delete dados] - dados excluidos, tabela do banco pronta pra reincersão dos novos dados cadastrais`,
        contexto
      );
    } catch (e) {
      addErro(
        `[delete tabela cadastro] - Erro ao deletar os dados do cadastro antes da reinserção, erro: ${e.message}`,
        contexto
      );
      await updateLoggerController(metadados, contexto);
      return;
    }
  } else if (validator === "substituir") {
    try {
      await deleteFromTable(metadados);
      addAviso(
        `[gerenciamento de inserções] operação de substituição, dados referente a data inserida foram excluidos`,
        contexto
      );
    } catch (e) {
      addErro(
        `Erro ao deletar período antes da reinserção, erro: ${e.message}`,
        contexto
      );
      await updateLoggerController(metadados, contexto);
      return;
    }
  } else if (validator === null) {
    addErro(
      "Validação retornou nulo. Dados possivelmente inválidos ou sem coluna de data.",
      contexto
    );
    await updateLoggerController(metadados, contexto);
    return;
  }
  addInfo("iniciando processo de insersão dos dados na tabela...", contexto);
  const total = metadados.total_linhas;
  const barraId = nomeArquivo;
  iniciarBarra(barraId, total, nomeArquivo, metadados.tabela);
  let i = 0;
  try {
    for await (const linhaOriginal of streamCsvRows(
      metadados.caminho_original,
      metadados.tipos_esperados
    )) {
      try {
        const linhaTipada = tiparLinha(
          linhaOriginal,
          metadados.tipos_esperados
        );
        const { result, linhaTipada: linhaInserida } =
          await insertRegisterinTable(metadados.tabela, linhaTipada);
        addAviso(
          `Linha ${i} inserida:\r\n` +
            `\r\n` +
            `Original: ${JSON.stringify(linhaOriginal)}\r\n` +
            `\r\n` +
            `Tipada:   ${JSON.stringify(linhaInserida)}\r\n` +
            `\r\n` +
            `----------------------------------------------`
        );
        sucesso++;
      } catch (e) {
        addErro(`Erro ao inserir linha ${i}, erro: ${e.message}`, contexto);
        erros.push({
          linha: i,
          erro: e.message,
          dados: linhaOriginal,
        });
        await updateLoggerController(metadados, contexto);
      } finally {
        atualizarBarra(barraId);
        i++;
      }
    }
  } finally {
    finalizarBarra(barraId);
    addInfo("processo de insersão finalizado, validar caso erros", contexto);
  }

  return {
    erro: erros.length > 0,
    total: total,
    inseridos: sucesso,
    falhas: erros.length,
    mensagem: erros.length > 0 ? "Algumas linhas falharam" : null,
    detalhes_erros: erros,
  };
}

export async function managerDeleterController(logData) {
  const contexto = logData.caminho_original;
  try {
    await deleteFromTable(logData);
    return { erro: false };
  } catch (e) {
    addErro(
      `Erro ao deletar período no banco pós exclusão do arquivo, erro: ${e.message}`,
      contexto
    );
    await updateLoggerController(logData, contexto);
    return { erro: true, mensagem: e.message };
  }
}
