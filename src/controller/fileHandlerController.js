import path from "path";
import crypto from "crypto";
import chokidarErrorHandler from "../middleware/errorHandler.js";
import hashValidatorController from "./hashValidatorController.js";
import { insertLog } from "../model/logModel.js";
// import { insertIntoTable } from "../services/dbService.js";
// import { registrarLog } from "../services/logService.js";

export async function  fileHandlerController(filePath, dataJson, action) {
  try {
    // mateamento do arquivo, oque está sendo adicionado, e onde o usuario pretende atualizar a base
    console.log(`\x1b[36mcaminho arquivo:\x1b[0m ${filePath}`);                //ex: /Banco/rotinas/03_11_40/2025/junho.csv     
    const fileName = path.basename(filePath);                                  //ex: junho.csv
    const baseAno = path.basename(path.dirname(filePath));                     //ex: 2023
    const baseMes = path.basename(filePath, path.extname(filePath))            //ex: junho
    const tabelaName = path.basename(path.dirname(path.dirname(filePath)));    //ex: 03_11_40

    //logs para teste console
    console.log(`\x1b[36mAção:\x1b[0m ${action}`);
    console.log(`\x1b[36mNome do arquivo:\x1b[0m ${fileName}`);
    console.log(`\x1b[33mAno:\x1b[0m ${baseAno}`);
    console.log(`\x1b[33mMes:\x1b[0m ${baseMes}`);
    console.log(`\x1b[33mTabela:\x1b[0m ${tabelaName}`);

    //criando o hash do arquivo para futura validação de update
    const hash = crypto.createHash("sha256").update(JSON.stringify(dataJson)).digest("hex");
    console.log (`\x1b[36mHash do arquivo:\x1b[0m ${hash}`);

    // 3. Verificar na tabela de ingestão se o arquivo já foi processado
    const resultado = await hashValidatorController(fileName, baseAno, tabelaName, hash, chokidarErrorHandler)
    if (resultado === "inserir") {
      const logData = {
      nome_arquivo: fileName,
      ano: baseAno,
      data_upload: new Date(), // ou uma string datetime se preferir
      hash_arquivo: hash,
      sucesso: true,
      mensagem_erro: null
    };
      const result = await insertLog(logData, tabelaName); // Insere o log na tabela correspondente


    } else if (resultado === "reprocessar") {

    } else {

    return;
    }

    // Exemplo fictício:
    /*
    const jaExiste = await db.ingestao.findFirst({
      where: { nome_arquivo: fileName, hash_arquivo: hash }
    });
    if (jaExiste) {
      console.log("Arquivo já processado, ignorando...");
      return;
    }
    */

    // 4. Inserir dados no banco
    // await insertIntoTable(tableName, dataJson);

    // 5. Registrar na tabela de controle de ingestão
    /*
    await db.ingestao.create({
      data: {
        nome_arquivo: fileName,
        data_upload: new Date(),
        hash_arquivo: hash,
        sucesso: true,
        mensagem_erro: null
      }
    });
    */

    // 6. Log de sucesso
    console.log(`Arquivo ${fileName} inserido com sucesso na tabela ${tableName}.`);

  } catch (error) {
    // Em caso de erro, registra log e lança
    console.error(`Erro ao processar arquivo: ${error.message}`);
    /*
    await registrarLog({
      nome_arquivo: fileName,
      data_upload: new Date(),
      hash_arquivo: hash,
      sucesso: false,
      mensagem_erro: error.message
    });
    */
    throw error;
  }
}
