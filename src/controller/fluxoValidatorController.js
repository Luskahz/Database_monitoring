import { addErro, addInfo, addAviso } from "../middleware/errorHandler.js";
import { getLogByData, getAllHashesFromTable, findLogByFileMeta } from "../model/logModel.js";
import { decideOverlapPolicy } from "../utils/decideOverlapPolicy.js";
import { buildRangeFromMetadados } from "../model/tableModel.js";
import { logActivity } from "../middleware/logger.js";
import { PIPELINE_FAST_PATH } from "../../config/index.js";

export default async function fluxoValidatorController(metadados, logData) {
  const contexto = metadados.caminho_original;
  const nome = metadados.nome_arquivo;
  const tabela = metadados.tabela;

  const fastPath = PIPELINE_FAST_PATH;

  const overlap = await ensureOverlapDecision(metadados, contexto);
  const strategy = overlap?.strategy || "insert";
  const hasOverlap = overlap?.hasOverlap === true;
  metadados.applyPreDelete = strategy === "replace";

  logOverlapUsage(contexto, {
    strategy,
    hasOverlap,
    reason: overlap?.reason ?? null,
    range: metadados.range ?? null,
  });

  if (fastPath) {
    if (!logData?.hash_arquivo) {
      addInfo(
        "[Validator] FAST_PATH: hash indisponível nesta etapa — validação seguirá por range.",
        contexto
      );
    }
    if (hasOverlap) {
      addInfo(
        `[ARQUIVO MODIFICADO] [${nome}] já existia, mas foi alterado. Reprocessando.`,
        contexto
      );
      console.log(
        `[🟡 MODIFICADO] [${nome}] sera inserido na tabela [${tabela}]`
      );
      return "reprocessar";
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

async function ensureOverlapDecision(metadados, contexto) {
  if (!metadados) return null;
  if (metadados.overlap) {
    if (!metadados.range) {
      metadados.range = buildRangeFromMetadados(metadados);
    }
    return metadados.overlap;
  }

  addAviso(
    "[OverlapDecision] Metadados sem decisão prévia; calculando tardiamente.",
    contexto
  );
  const range = metadados.range ?? buildRangeFromMetadados(metadados);
  metadados.range = range || null;
  const decision = await decideOverlapPolicy({
    table: metadados.tabela,
    dateCol: metadados.coluna_data,
    range,
    logger: createOverlapLogger(contexto),
  });
  metadados.overlap = decision;
  return decision;
}

function createOverlapLogger(contexto) {
  return {
    info(message, payload = {}) {
      try {
        const serialized = JSON.stringify(payload);
        const line = `${message} ${serialized}`;
        addInfo(line, contexto);
        void logActivity("info", line, { filePath: contexto });
      } catch (err) {
        addInfo(`${message} ${payload ? String(payload) : ""}`, contexto);
        void logActivity("info", message, { filePath: contexto });
      }
    },
  };
}

function logOverlapUsage(contexto, payload) {
  try {
    const line = `[OverlapDecision][Use] ${JSON.stringify(payload)}`;
    addInfo(line, contexto);
    void logActivity("info", line, { filePath: contexto });
  } catch (err) {
    addInfo("[OverlapDecision][Use]", contexto);
    void logActivity("info", "[OverlapDecision][Use]", { filePath: contexto });
  }
}
