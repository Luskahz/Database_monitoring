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
import { markJobComplete } from "../../utils/queueTracker.js";
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

function parseBoolean(value, defaultValue) {
  if (value == null) return defaultValue;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return defaultValue;
    if (["1", "true", "yes", "sim", "y"].includes(normalized)) return true;
    if (["0", "false", "no", "nao", "não", "n"].includes(normalized)) return false;
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

export default async function createdHandler(filePath, action, job) {
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
          `[Logger] não foi possível preparar log local temporário: ${err?.message || err}`,
          filePath,
        );
      }
    }

    try {
      loggerEntry = startLogger(filePath, loggerOptions);
    } catch (err) {
      addAviso(
        `[Logger] não foi possível iniciar logger dedicado: ${err?.message || err}`,
        filePath,
      );
      if (stagedLoggerInfo) {
        try {
          await finalizeStagedLogger(stagedLoggerInfo, { skipCopy: true });
        } catch (cleanupErr) {
          addAviso(
            `[Logger] não foi possível remover arquivo de início do processamento: ${cleanupErr?.message || cleanupErr}`,
            filePath,
          );
        }
        stagedLoggerInfo = null;
      }
    }

    if (loggerEntry) {
      try {
        await writeBeginFile({
          filePath,
          arquivo: arquivo || "—",
          tabela: "—",
          dataStr: "—",
          acao: "analyze",
          hash: "—",
        });
      } catch (err) {
        addAviso(
          `[Logger] não foi possível registrar bloco inicial: ${err?.message || err}`,
          filePath,
        );
      }
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
        let metadados;
        let logData;
        let processingSucceeded = false;

        try {
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

          const workFilePath = stagingInfo?.effectivePath || filePath;

          try {
            const result = await createDataController(filePath, action, {
              workFilePath,
              stagingInfo,
            });
            ({ metadados, logData } = result || {});
          } catch (e) {
            addErro(`erro ao gerar os dados fundamentais, erro:${e.message}`, filePath);
            return;
          }

          if (!metadados || !logData) {
            addErro("metadados ou logData não foram gerados corretamente", filePath);
            return;
          }

          let fluxo;
          try {
            fluxo = await fluxoValidatorController(metadados, logData);
          } catch (e) {
            addErro(`Erro ao validar fluxo de ingestão: ${e.message}`, filePath);
            return;
          }

          if (fluxo !== "inserir" && fluxo !== "reprocessar") {
            addInfo(
              `[ARQUIVO IGNORADO] ${metadados.nome_arquivo} já existe e não foi modificado.`,
              filePath
            );
            await insertLog(logData);
            processingSucceeded = true;
            return;
          }

          try {
            const resultado = await manageInsertController(metadados, logData);
            logData.sucesso = !resultado?.erro;
            logData.mensagem_erro = resultado?.mensagem || null;
            logData.hash_arquivo = metadados.hash;
            logData.total_linhas = metadados.total_linhas;
            if (resultado?.erro) addErro(logData.mensagem_erro, filePath);
          } catch (e) {
            logData.sucesso = false;
            logData.mensagem_erro = `Erro durante execução do managerDataController: ${e.message}`;
            addErro(logData.mensagem_erro, filePath);
          } finally {
            await insertLog(logData);
          }

          processingSucceeded = Boolean(logData?.sucesso);
        } finally {
          if (stagingInfo && stagingInfo.isRemote && stagingInfo.effectivePath) {
            const isDifferentPath = stagingInfo.effectivePath !== filePath;
            const hasCopy = stagingInfo.copied || stagingInfo.reused;
            if (isDifferentPath && hasCopy) {
              if (processingSucceeded && cleanupOnSuccess) {
                try {
                  await unlinkFile(stagingInfo.effectivePath);
                  stagingLogger.info(
                    `cópia local removida após sucesso (${stagingInfo.effectivePath})`
                  );
                } catch (err) {
                  stagingLogger.warn(
                    `falha ao remover cópia local (${stagingInfo.effectivePath}): ${err?.message || err}`
                  );
                }
              } else if (!processingSucceeded) {
                stagingLogger.info(
                  `mantendo cópia local para análise (${stagingInfo.effectivePath})`
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
              stagingLogger.warn(`cleanup tardio falhou: ${err?.message || err}`);
            }
          }
        }
      },
      { job, action, manageLogger: false }
    );
  } finally {
    if (loggerEntry) {
      try {
        await flushAggregatedSummaries(filePath);
      } catch (err) {
        addAviso(
          `[Logger] não foi possível registrar resumos de erros/avisos: ${err?.message || err}`,
          filePath,
        );
      }
      try {
        await writeFinal({ filePath });
      } catch (err) {
        addAviso(
          `[Logger] não foi possível registrar bloco final: ${err?.message || err}`,
          filePath,
        );
      }
    }

    try {
      await endLogger(filePath);
    } catch (err) {
      addAviso(
        `[Logger] não foi possível encerrar logger dedicado: ${err?.message || err}`,
        filePath,
      );
    }

    if (stagedLoggerInfo) {
      try {
        await finalizeStagedLogger(stagedLoggerInfo);
      } catch (err) {
        addAviso(
          `[Logger] Falha ao copiar log final para a rede: ${err?.message || err}`,
          filePath,
        );
      }
    }
  }
}
