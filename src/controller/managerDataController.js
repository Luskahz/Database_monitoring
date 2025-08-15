import {
  insertRegisterinTable,
  insertBatchInTable,
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
import {
  detectDelimiter,
  detectEncoding,
} from "../utils/prepareStreamByFilepath.js";
import { debugPeekHeader } from "../utils/debugHeader.js";
import sanitizeRow from "../utils/sanitizeValue.js";
import {
  loadDecimalProfilesFromSchema,
  expandTiposWithSchema,
} from "../model/tableModel.js";

export async function manageInsertController(metadados) {
  const contexto = metadados.caminho_original;
  const nomeArquivo = metadados.nome_arquivo ?? "arquivo-desconhecido";
  const schemaMap  = await loadDecimalProfilesFromSchema(metadados.tabela);
  const tiposFinal = expandTiposWithSchema(metadados.tipos_esperados, schemaMap);

  // Preferir os valores vindos da análise (um único detect por arquivo)
  let encoding = metadados.encoding;
  let delimiter = metadados.delimiter;
  const headersNorm = metadados.colunas_json;

  // Fallback opcional: garante valores se, por algum motivo, não vieram nos metadados
  if (!encoding || !delimiter) {
    const detE = await detectEncoding(contexto);
    encoding = encoding || detE.encoding;
    delimiter = delimiter || (await detectDelimiter(contexto, encoding));
  }

  if (!metadados.total_linhas || metadados.total_linhas === 0) {
    addAviso("Nenhuma linha disponível para inserção.", contexto);
    return;
  }

  // 👇 você tinha removido estas duas variáveis, mas as usa no retorno
  const erros = [];
  let sucesso = 0;

  let listFromTable;
  try {
    listFromTable = await listPeriodInTable(metadados);
  } catch (e) {
    addErro(`Erro ao consultar o período no banco: ${e.message}`, contexto);
    throw e;
  }

  const validator = await insertValidator(listFromTable, metadados);

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

  // começa a iniciar as linhas
  const total = metadados.total_linhas;
  const barraId = `${nomeArquivo}::${metadados.ano}::${metadados.tabela}`;
  iniciarBarra(barraId, total, nomeArquivo, metadados.tabela, metadados.ano);
  const cols = metadados.colunas_tabela;
  let i = 0;

  const BATCH_SIZE = 10000;
  let batch = [];

  async function flushBatch() {
    if (batch.length === 0) return;
    const linhasTipadas = batch.map((b) => b.tipada);
    try {
      await insertBatchInTable(metadados.tabela, linhasTipadas, cols);
      sucesso += batch.length;
      atualizarBarra(barraId, batch.length);
      i += batch.length;
    } catch (e) {
      // 👇 importante para entender por que não está batendo os 1000
      addAviso(
        `[BATCH] Falha ao inserir ${batch.length} registros em lote. ` +
          `Fazendo fallback linha-a-linha. Motivo: ${e.message}`,
        contexto
      );
      await updateLoggerController(metadados, contexto);

      for (const item of batch) {
        const linhaIdx = i;
        const linhaHumana = linhaIdx + 1;
        try {
          await insertRegisterinTable(metadados.tabela, item.tipada, cols);
          sucesso++;
          atualizarBarra(barraId, 1); // <-- só avança se inseriu OK
        } catch (err) {
          addErro(
            `Erro ao inserir linha ${linhaHumana}, erro: ${err.message}`,
            contexto
          );
          erros.push({
            linha: linhaHumana,
            erro: err.message,
            dados: item.original,
          });
          await updateLoggerController(metadados, contexto);
        } finally {
          i++;
        }
      }
    }
    batch = [];
  }

  try {
    for await (const linhaOriginal of streamCsvRows(
      contexto,
      headersNorm,
      encoding,
      delimiter
    )) {
      const linhaTipada = sanitizeRow(
        linhaOriginal,
        tiposFinal,
        contexto
      );
      batch.push({ original: linhaOriginal, tipada: linhaTipada });
      if (batch.length >= BATCH_SIZE) await flushBatch();
    }
    await flushBatch();
  } finally {
    finalizarBarra(barraId);
    addInfo("processo de insersão finalizado, validar caso erros", contexto);
  }

  return {
    erro: erros.length > 0,
    total,
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
