import path from "path";
import fs from "fs/promises";
import iconv from "iconv-lite";
import Papa from "papaparse";

import {
  colunsValidator,
  dataFromBasesValidatorController,
  normalizar,
} from "./dataFromBasesValidatorController.js";
import { getColunsFromTable, getTiposFromTable } from "../model/tableModel.js";
import { sanitizeRow } from "../model/createSchemaMode.js";
import { createHashByData } from "../model/logModel.js";

export function destinoByFilePath(filePath) {
  try {
    const fileName = path.basename(filePath);
    const baseAno = path.basename(path.dirname(filePath));
    const baseMes = path.basename(filePath, path.extname(filePath));
    const tabelaName = path.basename(path.dirname(path.dirname(filePath)));

    return {
      nome_arquivo: fileName,
      ano: baseAno,
      mes: baseMes,
      tabela_destino: tabelaName,
    }
  } catch (error) {
    console.error("erro ao gerar destino com base no caminho do arquivo");
    throw error;
  }
}
async function extractInfosByData(tabelaName, dataJson) {
  try {
    const dataColun = await dataFromBasesValidatorController(
      tabelaName,
      dataJson
    );
    const tiposEsperados = await getTiposFromTable(tabelaName);
    const colunsTable = await getColunsFromTable(tabelaName);
    const colunsJson = Object.keys(dataJson[0] || {});

    return {
      coluna_data: dataColun,
      tipagem: tiposEsperados,
      colunas_tabela: colunsTable,
      colunas_json: colunsJson,
    };
  } catch (error) {
    console.error(
      `Erro ao extrair informações da tabela destino ou colunas do Json csv, erro: ${error.message}`
    );
    throw error;
  }
}
export default async function createDataController(filePath, dataJson, action) {
  try {
    const destino = destinoByFilePath(filePath);
    const infos = await extractInfosByData(destino.tabela_destino, dataJson);
    const hash = createHashByData(dataJson);

    const metadados = {
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
      caminho_original: filePath
    };

    const logData = {
      tabela_destino: metadados.tabela,
      nome_arquivo: metadados.nome_arquivo,
      ano: parseInt(metadados.ano),
      mes: metadados.mes,
      coluna_data: metadados.coluna_data,
      data_upload: new Date(),
      hash_arquivo: hash,
      sucesso: true,
      mensagem_erro: null,
    };

    return { metadados, logData };
  } catch (error) {
    console.error(
      `Erro ao gerar os objetos fundamentais, erro: ${error.message}`
    );
    throw error;
  }
}

export async function createJsonController(filePath) {
  // importar a função destino onde essa função é chamada pra diminuir o tamanho
  const tabelaName = path.basename(path.dirname(path.dirname(filePath)));
  const buffer = await fs.readFile(filePath);
  const data = iconv.decode(buffer, "latin1");
  const firstLine = data.split(/\r?\n/)[0];

  if (firstLine.includes(",") || firstLine.includes(";")) {
    const delimiter = firstLine.includes(";") ? ";" : ",";

    const parsed = Papa.parse(data, {
      header: true,
      delimiter,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      transform: (value) => value.trim(),
    });
    if (parsed.errors.length) {
      console.warn(
        "Aviso: erros encontrados no CSV, algumas linhas serão ignoradas."
      );
      //console.table(parsed.errors);
    }
    const linhasValidas = parsed.data.filter((linha) => {
      const valores = Object.values(linha);
      const preenchidos = valores.filter((v) => v?.trim() !== "").length;
      return preenchidos >= 3;
    });

    const tiposEsperados = await getTiposFromTable(tabelaName);
    //console.log(`colunas originais: `,JSON.stringify(Object.keys(linhasValidas[1]), null, 2));
    const dataJsonNormalized = linhasValidas.map((linha) => {
      const novaLinha = {};
      const nomesUsados = {}; // vai registrar quantas vezes um nome foi usado

      for (const chave in linha) {
        const base = normalizar(chave);
        let nomeFinal = base;

        if (nomesUsados[base]) {
          nomesUsados[base]++;
          nomeFinal = `${base}_${nomesUsados[base]}`;
        } else {
          nomesUsados[base] = 1;
        }

        novaLinha[nomeFinal] = linha[chave];
      }

      return novaLinha;
    });
    const dataSanitized = dataJsonNormalized.map((linha) =>
      sanitizeRow(linha, tiposEsperados)
    );
    return dataSanitized;
  } else {
    console.log(`Arquivo ignorado: ${filePath} - Não é um CSV válido`);
  }
}

function preLogger(metadados) {
  console.log(`\x1b[33m--------------------------------------------------------------------------------\x1b[0m`);
  console.log(`\x1b[36mAção:\x1b[0m ${metadados.action}`);
  console.log(`\x1b[36mNome do arquivo:\x1b[0m ${fileName}`);
  console.log(`\x1b[33mAno:\x1b[0m ${metadados.ano}`);
  console.log(`\x1b[33mMes:\x1b[0m ${metadados.mes}`);
  console.log(`\x1b[33mTabela:\x1b[0m ${metadados.tabela}`);
  console.log(`\x1b[36mColunas de data encontradas na tabela:\x1b[0m`, tabelaName,
    dataColun
  );
  console.log(`\x1b[36mHash do arquivo:\x1b[0m ${metadados.hash}`);
  //console.log(`\x1b[36mColunas da tabela:\x1b[0m`, colunsTable);
  //console.log(`\x1b[36mColunas do JSON:\x1b[0m`, colunsJson);
  colunsValidator(metadados.colunas_json, metadados.colunas_tabela)
  console.log(`\x1b[33m--------------------------------------------------------------------------------\x1b[0m`);
}
