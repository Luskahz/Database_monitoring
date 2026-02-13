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
  markJobComplete
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
import { toBool, toNumber } from "../../utils/normalizar.js";
import {startPerf, endPerf} from "../../utils/perfLogger.js";

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
  const PERF = typeof startPerf === "function" && typeof endPerf === "function";
  const perfPrefix = (() => {
    try { return `[${path.basename(filePath || "—")}|${job?.id || "—"}]`; } catch { return "[handler]"; }
  })();
  const L = (name) => `${perfPrefix} ${name}`;

  if (PERF) startPerf(L("TOTAL"));
  addInfo(
    `[DEBUG] Entrou no createdHandler para ${filePath} action=${action}`,
    filePath
  );
  const useFastPath = PIPELINE_FAST_PATH;
  if (!filePath) {
    addErro(
      "caminho do arquivo não definido no handler, sem como identificar qual arquivo deu erro...",
      filePath
    );
    if (job) {
      markJobComplete(job, { success: false, message: "FilePath indefinido" });
    }
    if (PERF) endPerf(L("TOTAL"), "filePath indefinido");
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

    // Logger staged
    if (shouldStageLogger(filePath)) {
      try {
        if (PERF) startPerf(L("logger.setupStagedLogger"));
        stagedLoggerInfo = await setupStagedLogger(filePath);
        if (PERF) endPerf(L("logger.setupStagedLogger"));
        if (stagedLoggerInfo?.localLogPath) {
          loggerOptions.logPath = stagedLoggerInfo.localLogPath;
        }
      } catch (err) {
        if (PERF) endPerf(L("logger.setupStagedLogger"), "erro");
        stagedLoggerInfo = null;
        addAviso(
          `[Logger] não foi possível preparar log local temporário: ${
            err?.message || err
          }`,
          filePath
        );
      }
    }

    // startLogger
    try {
      if (PERF) startPerf(L("logger.startLogger"));
      loggerEntry = startLogger(filePath, loggerOptions);
      if (PERF) endPerf(L("logger.startLogger"));
    } catch (err) {
      if (PERF) endPerf(L("logger.startLogger"), "erro");
      addAviso(
        `[Logger] não foi possível iniciar logger dedicado: ${
          err?.message || err
        }`,
        filePath
      );
      if (stagedLoggerInfo) {
        try {
          if (PERF) startPerf(L("logger.finalizeStagedLogger.skipCopy"));
          await finalizeStagedLogger(stagedLoggerInfo, { skipCopy: true });
          if (PERF) endPerf(L("logger.finalizeStagedLogger.skipCopy"));
        } catch (cleanupErr) {
          if (PERF) endPerf(L("logger.finalizeStagedLogger.skipCopy"), "erro");
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

    // ——— withFileLifecycle (macro) ———
    if (PERF) startPerf(L("withFileLifecycle"));
    await withFileLifecycle(
      filePath,
      async () => {
        const stagingLogger = createStagingLogger(filePath);
        const reuse = toBool(STAGING_REUSE, true);
        const verify = toBool(STAGING_VERIFY, true);
        const cleanupOnSuccess = toBool(STAGING_CLEANUP_ON_SUCCESS, true);
        const cleanupTtlMin = toNumber(STAGING_CLEANUP_TTL_MIN, 120);
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

          // ensureLocalStaging
          try {
            if (PERF) startPerf(L("staging.ensureLocalStaging"));
            stagingInfo = await ensureLocalStaging({
              srcPath: filePath,
              stagingDir: stagingDirEnv,
              reuse,
              verify,
              logger: stagingLogger,
            });
            if (PERF) endPerf(L("staging.ensureLocalStaging"));
          } catch (err) {
            if (PERF) endPerf(L("staging.ensureLocalStaging"), "erro");
            addErro(
              `[Staging] falha ao preparar cópia local: ${err?.message || err}`,
              filePath
            );
            return;
          }
          updateActiveJob(filePath, { stage: "staging" });

          const workFilePath = stagingInfo?.effectivePath || filePath;

          // createDataController
          try {
            addInfo(
              `[DEBUG] Antes do createDataController para ${filePath}`,
              filePath
            );
            if (PERF) startPerf(L("metadados.createDataController"));
            const result = await createDataController(filePath, action, {
              workFilePath,
              stagingInfo,
            });
            ({ metadados, logData } = result || {});
            if (PERF) endPerf(L("metadados.createDataController"));
            if (metadados) {
              contextTag = buildContextTag(metadados);
            }
          } catch (e) {
            if (PERF) endPerf(L("metadados.createDataController"), "erro");
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

          // writeBeginFile
          if (loggerEntry && !beginRegistrado) {
            const tabelaLog =
              metadados?.tabela || metadados?.destino?.tabela_destino || "—";
            try {
              if (PERF) startPerf(L("logger.writeBeginFile"));
              await writeBeginFile({
                filePath,
                arquivo: metadados.nome_arquivo || arquivo || "—",
                tabela: tabelaLog,
                dataStr: formatBeginData(metadados),
                acao: action || "analyze",
                hash: metadados?.hash || "—",
              });
              if (PERF) endPerf(L("logger.writeBeginFile"));
              beginRegistrado = true;
            } catch (err) {
              if (PERF) endPerf(L("logger.writeBeginFile"), "erro");
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

          // iniciarBarra
          if (!barraIniciada) {
            if (PERF) startPerf(L("progress.iniciarBarra"));
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
            if (PERF) endPerf(L("progress.iniciarBarra"));
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

          // fluxoValidatorController
          try {
            if (PERF) startPerf(L("fluxo.fluxoValidatorController"));
            fluxo = await fluxoValidatorController(metadados, logData);
            if (PERF) endPerf(L("fluxo.fluxoValidatorController"));
          } catch (e) {
            if (PERF) endPerf(L("fluxo.fluxoValidatorController"), "erro");
            prefixErro(`Erro ao validar fluxo de ingestão: ${e.message}`);
            return;
          }
          updateActiveJob(filePath, { stage: "validando-fluxo" });

          // fluxo = ignorado
          if (fluxo !== "inserir" && fluxo !== "reprocessar") {
            prefixInfo(
              `[ARQUIVO IGNORADO] ${metadados.nome_arquivo} já existe e não foi modificado.`
            );
            logData.sucesso = true;
            logData.mensagem_erro = null;

            if (PERF) startPerf(L("log.insertLog(ignorado)"));
            await insertLog(logData);
            if (PERF) endPerf(L("log.insertLog(ignorado)"));

            processingSucceeded = true;
            return;
          }

          addInfo(
            `[DEBUG] Antes do manageInsertController para ${filePath}`,
            filePath
          );

          // manageInsertController
          try {
            if (PERF) startPerf(L("insert.manageInsertController"));
            const resultado = await manageInsertController(metadados, logData);
            if (PERF) endPerf(L("insert.manageInsertController"));

            logData.sucesso = !resultado?.erro;
            logData.mensagem_erro = resultado?.mensagem || null;
            logData.hash_arquivo = metadados.hash;
            logData.total_linhas = metadados.total_linhas;
            if (resultado?.erro) prefixErro(logData.mensagem_erro);
          } catch (e) {
            if (PERF) endPerf(L("insert.manageInsertController"), "erro");
            logData.sucesso = false;
            logData.mensagem_erro = `Erro durante execução do managerDataController: ${e.message}`;
            prefixErro(logData.mensagem_erro);
          } finally {
            if (PERF) startPerf(L("log.insertLog(final)"));
            await insertLog(logData);
            if (PERF) endPerf(L("log.insertLog(final)"));
          }

          processingSucceeded = Boolean(logData?.sucesso);
        } finally {
          // limpeza de staging: remover cópia local
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
                  if (PERF) startPerf(L("staging.unlinkFile"));
                  await unlinkFile(stagingInfo.effectivePath);
                  if (PERF) endPerf(L("staging.unlinkFile"));
                  stagingLogger.info(
                    `${
                      contextTag ? `${contextTag} ` : ""
                    }cópia local removida após sucesso (${
                      stagingInfo.effectivePath
                    })`
                  );
                } catch (err) {
                  if (PERF) endPerf(L("staging.unlinkFile"), "erro");
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

          // cleanupStaging
          if (stagingInfo?.stagingDir) {
            try {
              if (PERF) startPerf(L("staging.cleanupStaging"));
              await cleanupStaging({
                stagingDir: stagingInfo.stagingDir,
                ttlMinutes: cleanupTtlMin,
                logger: stagingLogger,
              });
              if (PERF) endPerf(L("staging.cleanupStaging"));
            } catch (err) {
              if (PERF) endPerf(L("staging.cleanupStaging"), "erro");
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
    if (PERF) endPerf(L("withFileLifecycle"));

    addInfo(
      `[DEBUG] Finalizou processing ${filePath}, sucesso=${processingSucceeded}`,
      filePath
    );
  } finally {
    // flushAggregatedSummaries
    if (loggerEntry) {
      try {
        if (PERF) startPerf(L("logger.flushAggregatedSummaries"));
        await flushAggregatedSummaries(filePath);
        if (PERF) endPerf(L("logger.flushAggregatedSummaries"));
      } catch (err) {
        if (PERF) endPerf(L("logger.flushAggregatedSummaries"), "erro");
        addAviso(
          `[Logger] ${
            contextTag ? `${contextTag} ` : ""
          }não foi possível registrar resumos de erros/avisos: ${
            err?.message || err
          }`,
          filePath
        );
      }
      // writeFinal
      try {
        if (PERF) startPerf(L("logger.writeFinal"));
        await writeFinal({ filePath, dataStr: formatBeginData(metadados) });
        if (PERF) endPerf(L("logger.writeFinal"));
      } catch (err) {
        if (PERF) endPerf(L("logger.writeFinal"), "erro");
        addAviso(
          `[Logger] ${
            contextTag ? `${contextTag} ` : ""
          }não foi possível registrar bloco final: ${err?.message || err}`,
          filePath
        );
      }
    }

    // endLogger
    try {
      if (PERF) startPerf(L("logger.endLogger"));
      await endLogger(filePath);
      if (PERF) endPerf(L("logger.endLogger"));
    } catch (err) {
      if (PERF) endPerf(L("logger.endLogger"), "erro");
      addAviso(
        `[Logger] ${
          contextTag ? `${contextTag} ` : ""
        }não foi possível encerrar logger dedicado: ${err?.message || err}`,
        filePath
      );
    }

    // finalizarBarra
    if (barraIniciada && barraId) {
      try {
        if (PERF) startPerf(L("progress.finalizarBarra"));
        await finalizarBarra(barraId);
        if (PERF) endPerf(L("progress.finalizarBarra"));
      } catch (err) {
        if (PERF) endPerf(L("progress.finalizarBarra"), "erro");
        addAviso(
          `[Progress] ${
            contextTag ? `${contextTag} ` : ""
          }falha ao finalizar barra: ${err?.message || err}`,
          filePath
        );
      }
    }

    // finalizeStagedLogger
    if (stagedLoggerInfo) {
      try {
        if (PERF) startPerf(L("logger.finalizeStagedLogger"));
        await finalizeStagedLogger(stagedLoggerInfo);
        if (PERF) endPerf(L("logger.finalizeStagedLogger"));
      } catch (err) {
        if (PERF) endPerf(L("logger.finalizeStagedLogger"), "erro");
        addAviso(
          `[Logger] ${
            contextTag ? `${contextTag} ` : ""
          }Falha ao copiar log final para a rede: ${err?.message || err}`,
          filePath
        );
      }
    }

    // updateActiveJob finalizando
    try {
      if (PERF) startPerf(L("queue.updateActiveJob(finalizando)"));
      updateActiveJob(filePath, { stage: "finalizando" });
      if (PERF) endPerf(L("queue.updateActiveJob(finalizando)"));
    } catch {}

    // markJobComplete
    if (job && job.id) {
      try {
        addInfo(
          `[QUEUE-DEBUG] Liberando job ${job.id} para arquivo ${filePath}`,
          filePath
        );
        if (PERF) startPerf(L("queue.markJobComplete"));
        markJobComplete(job, {
          success: Boolean(logData?.sucesso),
          message: logData?.mensagem_erro || "OK",
        });
        if (PERF) endPerf(L("queue.markJobComplete"));
      } catch (err) {
        if (PERF) endPerf(L("queue.markJobComplete"), "erro");
        addErro(
          `[QUEUE-DEBUG] Falha ao liberar job ${job.id}: ${err}`,
          filePath
        );
      }
    }

    if (PERF) endPerf(L("TOTAL"));
  }
}

