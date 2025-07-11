import path from "path";
import crypto from "crypto"

import { dataFromBasesValidatorController, normalizar } from "./dataFromBasesValidatorController.js";
import { getColunsFromTable, getTiposFromTable } from "../model/tableModel.js";

export default async function createDataController(filePath, dataJson, action){
  const fileName = path.basename(filePath);                                                   //ex: junho.csv
  const baseAno = path.basename(path.dirname(filePath));                                      //ex: 2023
  const baseMes = path.basename(filePath, path.extname(filePath));                            //ex: junho
  const tabelaName = path.basename(path.dirname(path.dirname(filePath)));                     //ex: 03_11_40
  const dataColun = await dataFromBasesValidatorController(tabelaName, dataJson);             //ex: { index: 0, name: "dt_entrega" }
  const hash = crypto.createHash("sha256").update(JSON.stringify(dataJson)).digest("hex");
  const colunsTable = await getColunsFromTable(tabelaName);
  const colunsJson = Object.keys(dataJson[0] || {}).map((col) =>normalizar(col));
  const tiposEsperados = await getTiposFromTable(tabelaName)

  
  const metadados = {
    nome_arquivo: fileName,
    ano: baseAno,
    mes: baseMes,
    tabela: tabelaName,
    data_json: dataJson,
    coluna_data: dataColun,
    acao: action,
    colunas_tabela: colunsTable,
    colunas_json: colunsJson,
    tipos_esperados: tiposEsperados
  }
  const logData = {
    tabela_destino: tabelaName,
    nome_arquivo: fileName,
    ano: parseInt(baseAno),
    data_upload: new Date(),
    hash_arquivo: hash,
    sucesso: true,
    mensagem_erro: null,
  };

  //log para testes:
  console.log(`\x1b[36mAção:\x1b[0m ${action}`);
  console.log(`\x1b[36mNome do arquivo:\x1b[0m ${fileName}`)
  console.log(`\x1b[33mAno:\x1b[0m ${baseAno}`);
  console.log(`\x1b[33mMes:\x1b[0m ${baseMes}`);
  console.log(`\x1b[33mTabela:\x1b[0m ${tabelaName}`);
  console.log(`\x1b[36mColunas de data encontradas na tabela:\x1b[0m`, tabelaName, dataColun);
  console.log(`\x1b[36mHash do arquivo:\x1b[0m ${hash}`);
  //console.log(`\x1b[36m metadados completos:\x1b[0m`, JSON.stringify(metadados, null, 2));

  //console.log(`\x1b[36mColunas da tabela:\x1b[0m`, colunsTable);
  //console.log(`\x1b[36mColunas do JSON:\x1b[0m`, colunsJson);
  

  return {metadados, logData}
}