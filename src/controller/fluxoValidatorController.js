import { addErro, addInfo, addAviso } from "../middleware/errorHandler.js";
import { getLogByData, getAllHashesFromTable, findLogByFileMeta } from "../model/logModel.js";
import { decideOverlapPolicy } from "../utils/decideOverlapPolicy.js";
import { buildRangeFromMetadados } from "../model/tableModel.js";
import { logActivity } from "../middleware/logger.js";
import { PIPELINE_FAST_PATH } from "../../config/index.js";

function buildContextTag(meta) {
  if (!meta) return "";
  const tabela = meta.tabela || meta?.destino?.tabela_destino || "tabela-desconhecida";
  const ano = meta.ano ?? meta?.destino?.ano ?? meta?.range?.ano ?? "—";
  return `[${tabela}][${ano}]`;
}

function buildLogAction(meta) {
  if (!meta) return undefined;
  const tabela = meta.tabela || meta?.destino?.tabela_destino;
  const ano = meta.ano ?? meta?.destino?.ano ?? meta?.range?.ano;
  return [tabela, ano].filter((value) => value != null && value !== "").join(" ");
}

export default async function fluxoValidatorController(metadados, logData) {
  const contexto = metadados.caminho_original;
  const nome = metadados.nome_arquivo;
  const tabela = metadados.tabela;

  const fastPath = PIPELINE_FAST_PATH;
  const contextTag = buildContextTag(metadados);
  const actionContext = buildLogAction(metadados);
  const withTag = (msg) => (contextTag ? `${contextTag} ${msg}` : msg);
  const info = (msg) => addInfo(withTag(msg), contexto);
  const erro = (msg) => addErro(withTag(msg), contexto);
  const aviso = (msg) => addAviso(withTag(msg), contexto);

  const overlap = await ensureOverlapDecision(metadados, contexto);
  const strategy = overlap?.strategy || "insert";
  const hasOverlap = overlap?.hasOverlap === true;
  metadados.applyPreDelete = strategy === "replace";

  logOverlapUsage(contexto, {
    strategy,
    hasOverlap,
    reason: overlap?.reason ?? null,
    range: metadados.range ?? null,
  }, actionContext, contextTag);

  if (fastPath) {
    if (!logData?.hash_arquivo) {
      info(
        "[Validator] FAST_PATH: hash indisponível nesta etapa — validação seguirá por range."
      );
    }
    if (hasOverlap) {
      info(`[ARQUIVO MODIFICADO] [${nome}] já existia, mas foi alterado. Reprocessando.`);
      console.log(
        `[🟡 MODIFICADO] [${nome}] sera inserido na tabela [${tabela}]`
      );
      return "reprocessar";
    }

    info(`[NOVO ARQUIVO] [${nome}] será processado.`);
    console.log(`[🟢 NOVO] [${nome}] sera inserido na tabela [${tabela}]`);
    return "inserir";
  }

  const hash = logData?.hash_arquivo;

  if (!hash) {
    erro("Hash do arquivo não foi passado ao validador do fluxo.");
  }

  if (metadados?.file_size_bytes != null && metadados?.total_linhas != null) {
    try {
      const similar = await findLogByFileMeta({
        tabela_destino: metadados.tabela,
        file_size_bytes: metadados.file_size_bytes,
        total_linhas: metadados.total_linhas,
      });
      if (similar) {
        info(
          "[Validator] Meta match (size+lines) encontrado — provável duplicado; seguir com verificação por hash."
        );
      }
    } catch (e) {
      erro(`Erro ao buscar log por metadados: ${e.message}`);
    }
  }

  const pLogs = getLogByData(metadados).catch((e) => {
    erro(`erro ao extrair os logs referentes à data: ${e.message}`);
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
          erro(`Erro ao extrair os hashes: ${e.message}`);
          return false;
        })
    : Promise.resolve(false);

  const [logs, hashJaExiste] = await Promise.all([pLogs, pHashExiste]);

  if (hashJaExiste) {
    info(`[ARQUIVO DUPLICADO] O conteúdo de [${nome}] já está presente na base, ${tabela}.`);
    console.log(
      `[🟠 DUPLICADO] [${nome}] não sera inserido na tabela [${tabela}]`
    );
    return "ignorar";
  }

  if (!logs || logs.length === 0) {
    info(`[NOVO ARQUIVO] [${nome}] será processado.`);
    console.log(`[🟢 NOVO] [${nome}] sera inserido na tabela [${tabela}]`);
    return "inserir";
  }

  info(`[ARQUIVO MODIFICADO] [${nome}] já existia, mas foi alterado. Reprocessando.`);
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

  const contextTag = buildContextTag(metadados);
  const actionContext = buildLogAction(metadados);
  aviso(
    contextTag
      ? `${contextTag} [OverlapDecision] Metadados sem decisão prévia; calculando tardiamente.`
      : "[OverlapDecision] Metadados sem decisão prévia; calculando tardiamente.",
  );
  const range = metadados.range ?? buildRangeFromMetadados(metadados);
  metadados.range = range || null;
  const decision = await decideOverlapPolicy({
    table: metadados.tabela,
    dateCol: metadados.coluna_data,
    range,
    logger: createOverlapLogger(contexto, metadados.acao, actionContext, contextTag),
  });
  metadados.overlap = decision;
  return decision;
}

function createOverlapLogger(contexto, actionContext, contextTag = "") {
  return {
    info(message, payload = {}) {
      try {
        const serialized = JSON.stringify(payload);
        const line = `${message} ${serialized}`;
        addInfo(contextTag ? `${contextTag} ${line}` : line, contexto);
        void logActivity("info", line, { filePath: contexto, action: actionContext });
      } catch (err) {
        const fallback = `${message} ${payload ? String(payload) : ""}`;
        addInfo(contextTag ? `${contextTag} ${fallback}` : fallback, contexto);
        void logActivity("info", message, { filePath: contexto, action: actionContext });
      }
    },
  };
}

function logOverlapUsage(contexto, payload, actionContext, contextTag = "") {
  try {
    const line = `[OverlapDecision][Use] ${JSON.stringify(payload)}`;
    addInfo(contextTag ? `${contextTag} ${line}` : line, contexto);
    void logActivity("info", line, { filePath: contexto, action: actionContext });
  } catch (err) {
    const fallback = contextTag
      ? `${contextTag} [OverlapDecision][Use]`
      : "[OverlapDecision][Use]";
    addInfo(fallback, contexto);
    void logActivity("info", "[OverlapDecision][Use]", { filePath: contexto, action: actionContext });
  }
}
