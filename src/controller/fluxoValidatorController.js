import { addErro, addInfo } from "../middleware/errorHandler.js";
import { getLogByData, getAllHashesFromTable, findLogByFileMeta } from "../model/logModel.js";
import { existsAnyDataInRange } from "../model/tableModel.js";
import { PIPELINE_FAST_PATH } from "../../config/index.js";

export default async function fluxoValidatorController(metadados, logData) {
  const contexto = metadados.caminho_original;
  const nome = metadados.nome_arquivo;
  const tabela = metadados.tabela;

  const fastPath = PIPELINE_FAST_PATH === "true";

  if (fastPath) {
    if (!logData?.hash_arquivo) {
      addInfo(
        "[Validator] FAST_PATH: hash indisponível nesta etapa — validação seguirá por range.",
        contexto
      );
    }
    try {
      const overlap = await existsAnyDataInRange(metadados);
      if (overlap) {
        addInfo(
          `[ARQUIVO MODIFICADO] [${nome}] já existia, mas foi alterado. Reprocessando.`,
          contexto
        );
        console.log(
          `[🟡 MODIFICADO] [${nome}] sera inserido na tabela [${tabela}]`
        );
        return "reprocessar";
      }
    } catch (e) {
      addErro(`Erro ao verificar dados existentes: ${e.message}`, contexto);
    }

    addInfo(`[NOVO ARQUIVO] [${nome}] será processado.`, contexto);
    console.log(`[🟢 NOVO] [${nome}] sera inserido na tabela [${tabela}]`);
    return "inserir";
  }

  const hash = logData?.hash_arquivo;

  if (!hash) {
    addErro("Hash do arquivo não foi passado ao validador do fluxo.", contexto);
  }

  if (metadados?.file_size_bytes != null && metadados?.total_linhas != null) {
    try {
      const similar = await findLogByFileMeta({
        tabela_destino: metadados.tabela,
        file_size_bytes: metadados.file_size_bytes,
        total_linhas: metadados.total_linhas,
      });
      if (similar) {
        addInfo(
          "[Validator] Meta match (size+lines) encontrado — provável duplicado; seguir com verificação por hash.",
          contexto
        );
      }
    } catch (e) {
      addErro(`Erro ao buscar log por metadados: ${e.message}`, contexto);
    }
  }

  const pLogs = getLogByData(metadados).catch((e) => {
    addErro(`erro ao extrair os logs referentes à data: ${e.message}`, contexto);
    return null;
  });

  const pHashExiste = hash
    ? getAllHashesFromTable(metadados)
        .then((rows) => {
          if (!rows || rows.length === 0) return false;
          for (let i = 0; i < rows.length; i++) {
            if (rows[i] && rows[i].hash_arquivo === hash) return true;
          }
          return false;
        })
        .catch((e) => {
          addErro(`Erro ao extrair os hashes: ${e.message}`, contexto);
          return false;
        })
    : Promise.resolve(false);

  const [logs, hashJaExiste] = await Promise.all([pLogs, pHashExiste]);

  if (hashJaExiste) {
    addInfo(
      `[ARQUIVO DUPLICADO] O conteúdo de [${nome}] já está presente na base, ${tabela}.`,
      contexto
    );
    console.log(
      `[🟠 DUPLICADO] [${nome}] não sera inserido na tabela [${tabela}]`
    );
    return "ignorar";
  }

  if (!logs || logs.length === 0) {
    addInfo(`[NOVO ARQUIVO] [${nome}] será processado.`, contexto);
    console.log(`[🟢 NOVO] [${nome}] sera inserido na tabela [${tabela}]`);
    return "inserir";
  }

  addInfo(
    `[ARQUIVO MODIFICADO] [${nome}] já existia, mas foi alterado. Reprocessando.`,
    contexto
  );
  console.log(
    `[🟡 MODIFICADO] [${nome}] sera inserido na tabela [${tabela}], validar lógica de atualização para o tipo do arquivo`
  );
  return "reprocessar";
}
