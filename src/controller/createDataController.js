import path from "path";
import { doesCsvHaveDataController } from "./insertValidator.js";
import { getColumnsFromTable, getTiposFromTable } from "../model/tableModel.js";
import createHashByData from "../utils/createHashByData.js";
import createJsonController from "../utils/createJsonController.js";
import { addAviso, addErro } from "../middleware/errorHandler.js";

export default async function createDataController(filePath, action) {
  const contexto = filePath
  let dataJson;
  try {
    dataJson = await createJsonController(filePath);
    if (!dataJson || dataJson.length === 0) {
      addAviso("CSV vazio, validar se está válido", contexto);
      return null 
    } else if (Object.keys(dataJson[0]).length === 0) {
      addAviso("CSV possui registros, mas sem colunas detectadas.", contexto);
      return null
    }
  } catch (e) {
    addErro(`Erro ao converter CSV para JSON: ${e.message}`, contexto);
    throw e;
  }


  try {
    const { metadados, logData } = await createFundamentalDocsController(
      filePath,
      dataJson,
      action,
      contexto
    );
    return { metadados, logData };
  } catch (e) {
    addErro(`Erro ao gerar metadados e logData: ${e.message}`, contexto);
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
  const infos = await extractInfosByData(destino.tabela_destino, dataJson, filePath);

  return {
    nome_arquivo: destino.nome_arquivo,
    ano: destino.ano,
    mes: destino.mes,
    dia: destino.dia,
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
    dia: metadados.dia,
    coluna_data: metadados.coluna_data,
    data_upload: new Date(),
    hash_arquivo: metadados.hash,
    caminho_original: metadados.caminho_original, //trocar
    sucesso: true,
    mensagem_erro: null,
  };
}

export async function createFundamentalDocsController(
  filePath,
  dataJson,
  action,
  contexto
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
      `Erro ao gerar os objetos fundamentais, metadados e logdata, erro: ${e.message}`, contexto
    );
    throw e;
  }
}

async function extractInfosByData(tabelaName, dataJson, filePath) {
  const contexto = filePath
  try {
    const dataColun = await doesCsvHaveDataController(tabelaName, dataJson, contexto);
    const tiposEsperados = await getTiposFromTable(tabelaName);
    const colunsTable = await getColumnsFromTable(tabelaName);
    const colunsJson = Object.keys(dataJson[0] || {});

    return {
      coluna_data: dataColun,
      tipagem: tiposEsperados,
      colunas_tabela: colunsTable,
      colunas_json: colunsJson,
    };
  } catch (e) {
    addErro(
      `[FATAL] Erro ao extrair informações da tabela destino ou colunas do Json csv, erro: ${e.message}`, contexto
    );
    throw e;
  }
}

export function destinoByFilePath(filePath) {
  const fileName = path.basename(filePath);
  const parent = path.dirname(filePath);
  const grandParent = path.dirname(parent);
  const greatGrandParent = path.dirname(grandParent);

  const baseNameNoExt = path.basename(fileName, path.extname(fileName));
  if (/^\d+$/.test(baseNameNoExt)) {
    // Exemplo: .../2025/julho/1.csv
    return {
      nome_arquivo: fileName.toLocaleLowerCase(), //1.csv
      ano: path.basename(grandParent).toLocaleLowerCase(), // "2025"
      mes: path.basename(parent).toLocaleLowerCase(), // "julho"
      dia: path.basename(fileName, path.extname(fileName)).toLocaleLowerCase(), //1
      tabela_destino: path.basename(greatGrandParent).toLocaleLowerCase(), // "base_bees_deliver_dia"
    };
  } else {
    // Exemplo: .../2025/julho.csv
    return {
      nome_arquivo: fileName.toLocaleLowerCase(), //julho.csv
      ano: path.basename(parent).toLocaleLowerCase(), // "2025"
      mes: path.basename(fileName, path.extname(fileName)).toLocaleLowerCase(), // "julho"
      dia: null,
      tabela_destino: path.basename(grandParent).toLocaleLowerCase(), // "base_bees_deliver_dia"
    };
  }
}
