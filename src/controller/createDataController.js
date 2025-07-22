import path from "path";
import { doesCsvHaveDataController } from "./insertValidator.js";
import { getColunsFromTable, getTiposFromTable } from "../model/tableModel.js";
import createHashByData from "../utils/createHashByData.js";
import createJsonController from "../utils/createJsonController.js";
import { addAviso, addErro, addInfo } from "../middleware/errorHandler.js";

async function  extractInfosByData(tabelaName, dataJson) {
  try {
    const dataColun = await doesCsvHaveDataController(tabelaName, dataJson);
    const tiposEsperados = await getTiposFromTable(tabelaName);
    const colunsTable = await getColunsFromTable(tabelaName);
    const colunsJson = Object.keys(dataJson[0] || {});

    return {
      coluna_data: dataColun,
      tipagem: tiposEsperados,
      colunas_tabela: colunsTable,
      colunas_json: colunsJson,
    };
  } catch (e) {
    addErro(
      `[FATAL] Erro ao extrair informações da tabela destino ou colunas do Json csv, erro: ${e.message}`
    );
    throw e;
  }
}

export async function createMetadadosController(
  filePath,
  dataJson,
  hash,
  action
) {
  const destino = destinoByFilePath(filePath);
  const infos = await extractInfosByData(destino.tabela_destino, dataJson);

  return {
    nome_arquivo: destino.nome_arquivo,
    ano: destino.ano,
    mes: destino.mes,
    tabela: destino.tabela_destino,
    data_json: dataJson,
    hash: hash,
    coluna_data: infos.coluna_data,
    acao: action,
    colunas_tabela: infos.colunas_tabela,
    colunas_json: infos.colunas_json,
    tipos_esperados: infos.tipagem,
    caminho_original: filePath,
  };
}

export function createLogDataController(metadados) {
  return {
    tabela_destino: metadados.tabela,
    nome_arquivo: metadados.nome_arquivo,
    ano: parseInt(metadados.ano),
    mes: metadados.mes,
    coluna_data: metadados.coluna_data,
    data_upload: new Date(),
    hash_arquivo: hash,
    caminho_original: metadados.caminho_original, //trocar
    sucesso: true,
    mensagem_erro: null,
  };
}
export async function createFundamentalDocsController(
  filePath,
  dataJson,
  action
) {
  try {
    const hash = createHashByData(dataJson);
    const metadados = await createMetadadosController(
      filePath,
      dataJson,
      hash,
      action
    );
    const logData = createLogDataController(metadados);

    return { metadados, logData };
  } catch (e) {
    addErro(
      `Erro ao gerar os objetos fundamentais, metadados e logdata, erro: ${e.message}`
    );
    throw e;
  }
}

export default async function createDataController(filePath, action) {
  let dataJson;
  try {
    dataJson = await createJsonController(filePath);
  } catch (e) {
    addErro(`Erro ao converter CSV para JSON: ${e.message}`);
    await updateLoggerController(filePath)
    throw e;
  }
  if (dataJson && dataJson.length > 0) {
    addAviso(`Csv está vazio, validar se está valido`);
  }

  let metadados, logData;
  try {
    ({ metadados, logData } = await createFundamentalDocsController(
      filePath,
      dataJson,
      action
    ));
    return { metadados, logData };
  } catch (e) {
    addErro(`Erro ao gerar metadados e logData: ${e.message}`);
    await updateLoggerController(filePath)
    throw e;
  }
}

export function destinoByFilePath(filePath) {
  const fileName = path.basename(filePath);
  const baseAno = path.basename(path.dirname(filePath));
  const baseMes = path.basename(filePath, path.extname(filePath));
  const tabelaName = path.basename(path.dirname(path.dirname(filePath)));

  return {
    nome_arquivo: fileName,
    ano: baseAno,
    mes: baseMes,
    tabela_destino: tabelaName,
  };
}
