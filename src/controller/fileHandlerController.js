import path from "path";
import crypto from "crypto";
import chokidarErrorHandler from "../middleware/errorHandler.js";
import hashValidatorController from "./hashValidatorController.js";
import { getColunsFromTable, insertLog } from "../model/logModel.js";
import { dataFromBasesValidatorController,normalizar } from "./dataFromBasesValidatorController.js";
import { insertDataController } from "./insertDataController.js";

export async function  fileHandlerController(filePath, dataJson, action) {
  try {
    const fileName = path.basename(filePath);                                  //ex: junho.csv
    const baseAno = path.basename(path.dirname(filePath));                     //ex: 2023
    const baseMes = path.basename(filePath, path.extname(filePath))            //ex: junho
    const tabelaName = path.basename(path.dirname(path.dirname(filePath)));    //ex: 03_11_40
    const colunsTable = await getColunsFromTable(tabelaName)
    const colunsJson = Object.keys(dataJson[0] || {}).map((col) => normalizar(col));
    const hash = crypto.createHash("sha256").update(JSON.stringify(dataJson)).digest("hex");
    const dataColun = await dataFromBasesValidatorController(tabelaName, dataJson);
    const metadados = { 
      nome_arquivo: fileName,
      ano: baseAno,
      mes: baseMes,
      tabela: tabelaName,
      data_json: dataJson,
      coluna_data: dataColun,
      acao: action
    } 
    const logData = {
      tabela_destino: tabelaName,     
      nome_arquivo: fileName,        
      ano: parseInt(baseAno),         
      data_upload: new Date(),        
      hash_arquivo: hash,             
      sucesso: true,                  
      mensagem_erro: null             
    };
    

    console.log(`\x1b[36mAção:\x1b[0m ${action}`);
    console.log(`\x1b[36mNome do arquivo:\x1b[0m ${fileName}`);
    console.log(`\x1b[33mAno:\x1b[0m ${baseAno}`);
    console.log(`\x1b[33mMes:\x1b[0m ${baseMes}`);
    console.log(`\x1b[33mTabela:\x1b[0m ${tabelaName}`);
    console.log(`\x1b[36mHash do arquivo:\x1b[0m ${hash}`);
    console.log(`\x1b[36mColunas de data encontradas na tabela:\x1b[0m`, tabelaName,  dataColun);
    //console.log(`\x1b[36mColunas da tabela:\x1b[0m`, colunsTable);
    //console.log(`\x1b[36mColunas do JSON:\x1b[0m`, colunsJson);
    


    // 3. Verificar na tabela de ingestão se o arquivo já foi processado
    const resultado = await hashValidatorController(fileName, tabelaName, hash, chokidarErrorHandler)

    if (resultado === "inserir" && action === "created") {
      const insertTable = await insertDataController(metadados)
      const insertLogReturn = await insertLog(logData); // Insere o log na tabela correspondente

    } else if (resultado === "reprocessar") {
      // logica de reprocessamento, caso o arquivo já exista mas tenha sido modificado
    } else {
      console.log(`\x1b[33m[ARQUIVO IGNORADO]\x1b[0m ${fileName} já existe e não foi modificado.`)
      return; // Se for ignorar, não faz nada por enquanto, depois faremos um log txt
    }

  } catch (error) {
    console.error(`Erro ao processar arquivo: ${error.message}`)
    throw error
  }
}
