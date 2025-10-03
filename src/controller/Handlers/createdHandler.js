import path from "path";
import {
  addAviso,
  addErro,
  addInfo,
  flushAggregatedSummaries,
} from "../../middleware/errorHandler.js";
import { insertLog } from "../../model/logModel.js";
import createDataController from "../createDataController.js";
import fluxoValidatorController from "../fluxoValidatorController.js";
import { manageInsertController } from "../managerDataController.js";
import {
  PIPELINE_FAST_PATH,
  STAGING_CLEANUP_ON_SUCCESS,
  STAGING_CLEANUP_TTL_MIN,
  STAGING_DIR,
  STAGING_REUSE,
  STAGING_VERIFY,
} from "../../../config/index.js";
import { withFileLifecycle } from "../../utils/withFileLifecycle.js";
import {
  markJobActive,
  updateActiveJob,
  markJobComplete,
} from "../../utils/queueTracker.js";
import { ensureLocalStaging } from "../../utils/ensureLocalStaging.js";
import { cleanupStaging } from "../../utils/cleanupStaging.js";
import { unlink as unlinkFile } from "fs/promises";
import {
  startLogger,
  writeBeginFile,
  writeFinal,
  endLogger,
} from "../../middleware/logger.js";
import {
  finalizeStagedLogger,
  setupStagedLogger,
  shouldStageLogger,
} from "../../utils/loggerStaging.js";
import { iniciarBarra, finalizarBarra } from "../../utils/progressBar.js";

function parseBoolean(value, defaultValue) {
  if (value == null) return defaultValue;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return defaultValue;
    if (["1", "true", "yes", "sim", "y"].includes(normalized)) return true;
    if (["0", "false", "no", "nao", "não", "n"].includes(normalized))
      return false;
  }
  return defaultValue;
}

function parseNumber(value, defaultValue) {
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultValue;
}

function createStagingLogger(filePath) {
  return {
    info(message) {
      addInfo(`[Staging] ${message}`, filePath);
    },
    warn(message) {
      addAviso(`[Staging] ${message}`, filePath);
    },
    error(message) {
      addErro(`[Staging] ${message}`, filePath);
    },
  };
}

function buildContextTag(meta) {
  if (!meta) return "";
  const tabela =
    meta.tabela || meta?.destino?.tabela_destino || "tabela-desconhecida";
  const ano = meta.ano ?? meta?.destino?.ano ?? meta?.range?.ano ?? "—";
  return `[${tabela}][${ano}]`;
}

function formatBeginData(meta) {
  if (!meta) return "—";
  if (meta.ano != null) return String(meta.ano);
  const start = meta?.range?.start;
  if (start) {
    const d = new Date(start);
    if (!Number.isNaN(d?.getTime?.())) {
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${d.getFullYear()}-${month}-${day}`;
    }
  }
  return "—";
}

export default async function createdHandler(filePath, action, job) {
  addInfo(
    `[DEBUG] Entrou no createdHandler para ${filePath} action=${action}`,
    filePath
  );
  const useFastPath = PIPELINE_FAST_PATH; // kept for compatibility
  if (!filePath) {
    addErro(
      "caminho do arquivo não definido no handler, sem como identificar qual arquivo deu erro...",
      filePath
    );
    if (job) {
      markJobComplete(job, { success: false, message: "FilePath indefinido" });
    }
    return;
  }

  let loggerEntry = null;
  let stagedLoggerInfo = null;
  const arquivo = filePath ? path.basename(filePath) : "";
  let metadados = null;
  let logData = null;
  let contextTag = "";
  let barraId = null;
  let barraIniciada = false;
  let beginRegistrado = false;
  let processingSucceeded = false;

  try {
    const loggerOptions = {
      overwrite: true,
      disableBeginLine: true,
      disableEndLine: true,
    };

    if (shouldStageLogger(filePath)) {
      try {
        stagedLoggerInfo = await setupStagedLogger(filePath);
        if (stagedLoggerInfo?.localLogPath) {
          loggerOptions.logPath = stagedLoggerInfo.localLogPath;
        }
      } catch (err) {
        stagedLoggerInfo = null;
        addAviso(
          `[Logger] não foi possível preparar log local temporário: ${
            err?.message || err
          }`,
          filePath
        );
      }
    }

    try {
      loggerEntry = startLogger(filePath, loggerOptions);
    } catch (err) {
      addAviso(
        `[Logger] não foi possível iniciar logger dedicado: ${
          err?.message || err
        }`,
        filePath
      );
      if (stagedLoggerInfo) {
        try {
          await finalizeStagedLogger(stagedLoggerInfo, { skipCopy: true });
        } catch (cleanupErr) {
          addAviso(
            `[Logger] não foi possível remover arquivo de início do processamento: ${
              cleanupErr?.message || cleanupErr
            }`,
            filePath
          );
        }
        stagedLoggerInfo = null;
      }
    }

    if (job) {
      markJobActive(job, { stage: "preparando" });
    }
    await withFileLifecycle(
      filePath,
      async () => {
        const stagingLogger = createStagingLogger(filePath);
        const reuse = parseBoolean(STAGING_REUSE, true);
        const verify = parseBoolean(STAGING_VERIFY, true);
        const cleanupOnSuccess = parseBoolean(STAGING_CLEANUP_ON_SUCCESS, true);
        const cleanupTtlMin = parseNumber(STAGING_CLEANUP_TTL_MIN, 120);
        const stagingDirEnv =
          typeof STAGING_DIR === "string" && STAGING_DIR.trim().length > 0
            ? STAGING_DIR.trim()
            : undefined;

        let stagingInfo = null;
        processingSucceeded = false;

        try {
          addInfo(
            `[DEBUG] Antes do ensureLocalStaging para ${filePath}`,
            filePath
          );
          try {
            stagingInfo = await ensureLocalStaging({
              srcPath: filePath,
              stagingDir: stagingDirEnv,
              reuse,
              verify,
              logger: stagingLogger,
            });
          } catch (err) {
            addErro(
              `[Staging] falha ao preparar cópia local: ${err?.message || err}`,
              filePath
            );
            return;
          }
          updateActiveJob(filePath, { stage: "staging" });

          const workFilePath = stagingInfo?.effectivePath || filePath;

          try {
            addInfo(
              `[DEBUG] Antes do createDataController para ${filePath}`,
              filePath
            );
            const result = await createDataController(filePath, action, {
              workFilePath,
              stagingInfo,
            });
            ({ metadados, logData } = result || {});
            if (metadados) {
              contextTag = buildContextTag(metadados);
            }
          } catch (e) {
            addErro(
              `erro ao gerar os dados fundamentais, erro:${e.message}`,
              filePath
            );
            return;
          }

          if (!metadados || !logData) {
            addErro(
              "metadados ou logData não foram gerados corretamente",
              filePath
            );
            return;
          }
          updateActiveJob(filePath, { stage: "metadados" });

          if (loggerEntry && !beginRegistrado) {
            const tabelaLog =
              metadados?.tabela || metadados?.destino?.tabela_destino || "—";
            try {
              await writeBeginFile({
                filePath,
                arquivo: metadados.nome_arquivo || arquivo || "—",
                tabela: tabelaLog,
                dataStr: formatBeginData(metadados),
                acao: action || "analyze",
                hash: metadados?.hash || "—",
              });
              beginRegistrado = true;
            } catch (err) {
              addAviso(
                `[Logger] ${
                  contextTag ? `${contextTag} ` : ""
                }não foi possível registrar bloco inicial: ${
                  err?.message || err
                }`,
                filePath
              );
            }
          }

          if (!barraIniciada) {
            const nomeArquivo =
              metadados.nome_arquivo ?? arquivo ?? "arquivo-desconhecido";
            barraId = `${nomeArquivo}::${metadados.ano ?? "-"}::${
              metadados.tabela ?? "-"
            }`;
            iniciarBarra(
              barraId,
              100,
              nomeArquivo,
              metadados.tabela,
              metadados.ano
            );
            barraIniciada = true;
          }

          const prefixInfo = (msg) =>
            addInfo(`${contextTag} ${msg}`.trim(), filePath);
          const prefixErro = (msg) =>
            addErro(`${contextTag} ${msg}`.trim(), filePath);

          let fluxo;
          addInfo(
            `[DEBUG] Antes do fluxoValidatorController para ${filePath}`,
            filePath
          );
          try {
            fluxo = await fluxoValidatorController(metadados, logData);
          } catch (e) {
            prefixErro(`Erro ao validar fluxo de ingestão: ${e.message}`);
            return;
          }
          updateActiveJob(filePath, { stage: "validando-fluxo" });

          if (fluxo !== "inserir" && fluxo !== "reprocessar") {
            prefixInfo(
              `[ARQUIVO IGNORADO] ${metadados.nome_arquivo} já existe e não foi modificado.`
            );
            logData.sucesso = true; // 👈 adicione isso
            logData.mensagem_erro = null;
            await insertLog(logData);
            processingSucceeded = true;
            return;
          }
          addInfo(
            `[DEBUG] Antes do manageInsertController para ${filePath}`,
            filePath
          );
          try {
            const resultado = await manageInsertController(metadados, logData);
            logData.sucesso = !resultado?.erro;
            logData.mensagem_erro = resultado?.mensagem || null;
            logData.hash_arquivo = metadados.hash;
            logData.total_linhas = metadados.total_linhas;
            if (resultado?.erro) prefixErro(logData.mensagem_erro);
          } catch (e) {
            logData.sucesso = false;
            logData.mensagem_erro = `Erro durante execução do managerDataController: ${e.message}`;
            prefixErro(logData.mensagem_erro);
          } finally {
            await insertLog(logData);
          }

          processingSucceeded = Boolean(logData?.sucesso);
        } finally {
          if (
            stagingInfo &&
            stagingInfo.isRemote &&
            stagingInfo.effectivePath
          ) {
            const isDifferentPath = stagingInfo.effectivePath !== filePath;
            const hasCopy = stagingInfo.copied || stagingInfo.reused;
            if (isDifferentPath && hasCopy) {
              if (processingSucceeded && cleanupOnSuccess) {
                try {
                  await unlinkFile(stagingInfo.effectivePath);
                  stagingLogger.info(
                    `${
                      contextTag ? `${contextTag} ` : ""
                    }cópia local removida após sucesso (${
                      stagingInfo.effectivePath
                    })`
                  );
                } catch (err) {
                  stagingLogger.warn(
                    `${
                      contextTag ? `${contextTag} ` : ""
                    }falha ao remover cópia local (${
                      stagingInfo.effectivePath
                    }): ${err?.message || err}`
                  );
                }
              } else if (!processingSucceeded) {
                stagingLogger.info(
                  `${
                    contextTag ? `${contextTag} ` : ""
                  }mantendo cópia local para análise (${
                    stagingInfo.effectivePath
                  })`
                );
              }
            }
          }

          if (stagingInfo?.stagingDir) {
            try {
              await cleanupStaging({
                stagingDir: stagingInfo.stagingDir,
                ttlMinutes: cleanupTtlMin,
                logger: stagingLogger,
              });
            } catch (err) {
              stagingLogger.warn(
                `${contextTag ? `${contextTag} ` : ""}cleanup tardio falhou: ${
                  err?.message || err
                }`
              );
            }
          }
        }
      },
      { job, action, manageLogger: false }
    );
    addInfo(
      `[DEBUG] Finalizou processing ${filePath}, sucesso=${processingSucceeded}`,
      filePath
    );
  } finally {
    if (loggerEntry) {
      try {
        await flushAggregatedSummaries(filePath);
      } catch (err) {
        addAviso(
          `[Logger] ${
            contextTag ? `${contextTag} ` : ""
          }não foi possível registrar resumos de erros/avisos: ${
            err?.message || err
          }`,
          filePath
        );
      }
      try {
        await writeFinal({ filePath, dataStr: formatBeginData(metadados) });
      } catch (err) {
        addAviso(
          `[Logger] ${
            contextTag ? `${contextTag} ` : ""
          }não foi possível registrar bloco final: ${err?.message || err}`,
          filePath
        );
      }
    }

    try {
      await endLogger(filePath);
    } catch (err) {
      addAviso(
        `[Logger] ${
          contextTag ? `${contextTag} ` : ""
        }não foi possível encerrar logger dedicado: ${err?.message || err}`,
        filePath
      );
    }

    if (barraIniciada && barraId) {
      try {
        await finalizarBarra(barraId);
      } catch (err) {
        addAviso(
          `[Progress] ${
            contextTag ? `${contextTag} ` : ""
          }falha ao finalizar barra: ${err?.message || err}`,
          filePath
        );
      }
    }

    if (stagedLoggerInfo) {
      try {
        await finalizeStagedLogger(stagedLoggerInfo);
      } catch (err) {
        addAviso(
          `[Logger] ${
            contextTag ? `${contextTag} ` : ""
          }Falha ao copiar log final para a rede: ${err?.message || err}`,
          filePath
        );
      }
    }

    try {
      updateActiveJob(filePath, { stage: "finalizando" });
    } catch {}

    if (job && job.id) {
      try {
        // evita “double-complete”: só libera se ainda estiver ativo
        // (ajuda caso algum outro ponto tenha liberado antes)
        addInfo(
          `[QUEUE-DEBUG] Liberando job ${job.id} para arquivo ${filePath}`,
          filePath
        );
        markJobComplete(job, {
          success: Boolean(logData?.sucesso),
          message: logData?.mensagem_erro || "OK",
        });
      } catch (err) {
        addErro(`[QUEUE-DEBUG] Falha ao liberar job ${job.id}: ${err}`, filePath);
      }
    }
  }
}
