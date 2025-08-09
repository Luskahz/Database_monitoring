import {
  insertRegisterinTable,
  listPeriodInTable,
  deleteFromTable,
  getColumnsFromTable,
} from "../model/tableModel.js";
import {
  iniciarBarra,
  atualizarBarra,
  finalizarBarra,
} from "../utils/progressBar.js";

import { insertValidator } from "./insertValidator.js";
import tiparLinha from "../utils/tiparLinha.js";
import { addAviso, addErro, addInfo } from "../middleware/errorHandler.js";
import pLimit from "p-limit";
import { updateLoggerController } from "../middleware/logger.js";

const linhasPorArquivo = new Map();
let proximaLinhaDisponivel = 1;

function reservarLinhaParaArquivo(nomeArquivo) {
  if (!linhasPorArquivo.has(nomeArquivo)) {
    linhasPorArquivo.set(nomeArquivo, proximaLinhaDisponivel++);
  }
  return linhasPorArquivo.get(nomeArquivo);
}

export async function manageInsertController(metadados) {
  const contexto = metadados.caminho_original;
  const nomeArquivo = metadados.nome_arquivo ?? "arquivo-desconhecido";
  const linhaProgresso = reservarLinhaParaArquivo(nomeArquivo);
  if (!Array.isArray(metadados.data_json) || metadados.data_json.length === 0) {
    addAviso("Nenhuma linha disponível para inserção.", contexto);
    return;
  }

  let listFromTable;
  try {
    listFromTable = await listPeriodInTable(metadados); //caso a base seja cadastral, vai retornar null aqui se não, vai retornar um objeto com {dataCol: 'data da linha'}
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
  const total = metadados.data_json.length;
  const barraId = nomeArquivo;
  iniciarBarra(barraId, total, nomeArquivo, metadados.tabela);
  const colunasTabela = await getColumnsFromTable(metadados.tabela);
  const limit = pLimit(10);
  const tarefas = metadados.data_json.map((linhaOriginal, i) =>
    limit(async () => {
      try {
        const linhaTipada = linhaOriginal;

        const { linhaTipada: linhaInserida } = await insertRegisterinTable(
          metadados.tabela,
          linhaTipada,
          colunasTabela
        );
        addInfo(
          `Linha ${i} inserida:\r\n` +
            +`\r\n` +
            `Original: ${JSON.stringify(linhaOriginal)}\r\n` +
            +`\r\n` +
            `Tipada:   ${JSON.stringify(linhaInserida)}\r\n` +
            +`\r\n` +
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
      }
    })
  );

  try {
    await Promise.all(tarefas);
  } finally {
    finalizarBarra(barraId);
  }

  addInfo("processo de insersão finalizado, validar caso erros", contexto);
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
