import { addErro, addInfo } from "../../middleware/errorHandler.js";
import {
  createLoggerController,
  finalLoggerController,
  getLoggerContext,
  updateLoggerController,
  logCsvVsTableHeaders
} from "../../middleware/logger.js";
import { insertLog } from "../../model/logModel.js";
import createDataController from "../createDataController.js";
import fluxoValidatorController from "../fluxoValidatorController.js";
import { manageInsertController } from "../managerDataController.js";
import { PIPELINE_FAST_PATH } from "../../../config/index.js";



export default async function createdHandler(filePath, action) {

  // read fast-path flag (unused but kept for clarity)
  const useFastPath = PIPELINE_FAST_PATH;

  if (!filePath) {
    addErro(
      "caminho do arquivo não definido no handler, sem como identificar qual arquivo deu erro...",
      filePath
    );
    return;
  }
  let metadados, logData;

  try {
    await createLoggerController(filePath);
    try {
      const result = await createDataController(filePath, action);
      ({ metadados, logData } = result || {});
      await logCsvVsTableHeaders({contexto: filePath, tabela: metadados?.tabela, colunasCsv: metadados?.colunas_json || [], colunasTabela: metadados?.colunas_tabela || [], });
    
    } catch (e) { addErro(`erro ao gerar os dados fundamentais, erro:${e.message}`, filePath); return;
    }

    if (!metadados || !logData) { addErro("metadados ou logData não foram gerados corretamente", filePath);}

    let fluxo;
    try {
      fluxo = await fluxoValidatorController(metadados, logData);
    } catch (e) {  addErro(`Erro ao validar fluxo de ingestão: ${e.message}`, filePath); return;
    } 

    if (fluxo !== "inserir" && fluxo !== "reprocessar") {
      addInfo(`[ARQUIVO IGNORADO] ${metadados.nome_arquivo} já existe e não foi modificado.`, filePath);
      await insertLog(logData);
      return;
    }

    try {
      const resultado = await manageInsertController(metadados);
      logData.sucesso = !resultado?.erro;
      logData.mensagem_erro = resultado?.mensagem || null;
      logData.hash_arquivo = metadados.hash;

      if (resultado?.erro) addErro(logData.mensagem_erro, filePath);
    } catch (e) {
      logData.sucesso = false;
      logData.mensagem_erro = `Erro durante execução do managerDataController: ${e.message}`;
      addErro(logData.mensagem_erro, filePath);
    } finally {
      await Promise.all([
        insertLog(logData),
      ]);
    }

  } catch (e) { addErro(`erro no createdHandler, erro: ${e.message}, caminho do erro: ${e.stack}`, filePath); return;
  } finally { 
    await updateLoggerController(getLoggerContext(metadados, logData, filePath), filePath);
    await finalLoggerController(getLoggerContext(metadados, logData, filePath), filePath);
  }
}
