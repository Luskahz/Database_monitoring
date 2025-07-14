import path from "path";
import fs from "fs/promises";
import iconv from "iconv-lite";
import crypto from "crypto";
import Papa from "papaparse";

import {
  colunsValidator,
  dataFromBasesValidatorController,
  normalizar,
} from "./dataFromBasesValidatorController.js";
import { getColunsFromTable, getTiposFromTable } from "../model/tableModel.js";
import { sanitizeRow } from "../model/createSchemaMode.js";

export default async function createDataController(filePath, dataJson, action) {
  const fileName = path.basename(filePath); //ex: junho.csv
  const baseAno = path.basename(path.dirname(filePath)); //ex: 2023
  const baseMes = path.basename(filePath, path.extname(filePath)); //ex: junho
  const tabelaName = path.basename(path.dirname(path.dirname(filePath))); //ex: 03_11_40
  const dataColun = await dataFromBasesValidatorController(
    tabelaName,
    dataJson
  ); //ex: { index: 0, name: "dt_entrega" }
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(dataJson))
    .digest("hex");
  const colunsTable = await getColunsFromTable(tabelaName);
  const colunsJson = Object.keys(dataJson[0] || {});
  const tiposEsperados = await getTiposFromTable(tabelaName);

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
    tipos_esperados: tiposEsperados,
  };
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
  console.log(
    `\x1b[33m--------------------------------------------------------------------------------\x1b[0m`
  );
  console.log(`\x1b[36mAção:\x1b[0m ${action}`);
  console.log(`\x1b[36mNome do arquivo:\x1b[0m ${fileName}`);
  console.log(`\x1b[33mAno:\x1b[0m ${baseAno}`);
  console.log(`\x1b[33mMes:\x1b[0m ${baseMes}`);
  console.log(`\x1b[33mTabela:\x1b[0m ${tabelaName}`);
  console.log(
    `\x1b[36mColunas de data encontradas na tabela:\x1b[0m`,
    tabelaName,
    dataColun
  );
  console.log(`\x1b[36mHash do arquivo:\x1b[0m ${hash}`);
  //console.log(`\x1b[36mColunas da tabela:\x1b[0m`, colunsTable);
  //console.log(`\x1b[36mColunas do JSON:\x1b[0m`, colunsJson);
  colunsValidator(colunsJson, colunsTable)
  console.log(
    `\x1b[33m-------------------------------------------------------------------------------\x1b[0m`
  );

  return { metadados, logData };
}

export async function createJsonController(filePath) {
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
