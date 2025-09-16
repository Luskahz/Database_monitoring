import { addErro, addInfo } from "../../middleware/errorHandler.js";
import { insertLog } from "../../model/logModel.js";
import createDataController from "../createDataController.js";
import fluxoValidatorController from "../fluxoValidatorController.js";
import { manageInsertController } from "../managerDataController.js";
import { PIPELINE_FAST_PATH } from "../../../config/index.js";
import { withFileLifecycle } from "../../utils/withFileLifecycle.js";
import { markJobComplete } from "../../utils/queueTracker.js";

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

  await withFileLifecycle(
    filePath,
    async () => {
      let metadados, logData;
      try {
        const result = await createDataController(filePath, action);
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
    },
    { job, action }
  );
}
