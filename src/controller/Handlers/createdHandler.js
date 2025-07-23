import { json } from "express";
import { addErro, addInfo } from "../../middleware/errorHandler.js";
import {
  createLoggerController,
  finalLoggerController,
} from "../../middleware/logger.js";
import { insertHashInCache } from "../../model/cacheModel.js";
import { insertLog } from "../../model/logModel.js";
import createDataController from "../createDataController.js";
import fluxoValidatorController from "../fluxoValidatorController.js";
import { manageInsertController } from "../managerDataController.js";

export default async function createdHandler(filePath) {
  try {
    // ------------criando logger -----------------
    await createLoggerController(filePath);
    //---------- criando os docs, e validando o fluxo de insersão -----------


    let resultado;
    try {
      resultado = await createDataController(filePath);
    } catch (e) {
      addErro(`erro ao gerar os dados fundamentais, erro:${e.message}`);
      finalLoggerController(filePath);
      return;
    }
    const { metadados, logData } = resultado;


    if (!metadados || !logData) {
      addErro(`metadados ou logData não foram gerados corretamente`);
      finalLoggerController(filePath);
      return;
    }

    let fluxo;
    try {
      fluxo = await fluxoValidatorController(metadados, logData);
    } catch (e) {
      addErro(`Erro ao validar fluxo de ingestão: ${e.message}`);
      finalLoggerController(metadados);
      return;
    }

    

    //-------------- vai retorna o logdata o metadados e o fluxo -----------

 if (fluxo === "inserir" || fluxo === "reprocessar") {
  let resultado;
  try {
    console.log("📦 Iniciando manageInsertController...");
    resultado = await manageInsertController(metadados);
    console.log("✅ Resultado do manageInsertController:", resultado);

    logData.sucesso = !resultado?.erro;
    logData.mensagem_erro = resultado?.mensagem || null;

    if (resultado?.erro) {
      addErro(logData.mensagem_erro);
    }

    console.log("📝 Iniciando insertLog...");
    const logRes = await insertLog(logData);
    console.log("✅ insertLog concluído:", logRes);

    console.log("💾 Iniciando insertHashInCache...");
    const hashRes = await insertHashInCache(logData);
    console.log("✅ insertHashInCache concluído:", hashRes);

    console.log("📄 Iniciando finalLoggerController...");
    const loggerRes = await finalLoggerController(metadados);
    console.log("✅ finalLoggerController concluído:", loggerRes);

  } catch (e) {
    logData.sucesso = false;
    logData.mensagem_erro = `Erro durante execução do managerDataController: ${e.message}`;
    addErro(`Erro durante execução do managerDataController: ${e.message}`);

    console.log("❌ ERRO no bloco de inserção:", e);

    try {
      const logFail = await insertLog(logData);
      console.log("⚠️ insertLog (fallback) concluído:", logFail);
    } catch (logErr) {
      console.log("❌ Erro ao logar logData no fallback:", logErr);
    }

    try {
      const hashFail = await insertHashInCache(logData);
      console.log("⚠️ insertHashInCache (fallback) concluído:", hashFail);
    } catch (hashErr) {
      console.log("❌ Erro ao salvar cache fallback:", hashErr);
    }

    try {
      const finalFail = await finalLoggerController(metadados);
      console.log("⚠️ finalLoggerController (fallback) concluído:", finalFail);
    } catch (finalErr) {
      console.log("❌ Erro ao executar finalLoggerController fallback:", finalErr);
    }
  }
    } else {
      addInfo(
        `[ARQUIVO IGNORADO] ${metadados.nome_arquivo} já existe e não foi modificado.`
      );
      finalLoggerController(metadados);
      return;
    }
  } catch (e) {
    addErro(`erro no createdHandler, erro: ${e.message}`);
    await finalLoggerController(filePath);
    return;
  }
}
