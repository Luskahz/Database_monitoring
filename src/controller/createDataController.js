import path from "path";
import fs from "fs/promises";
import iconv from "iconv-lite";
import Papa from "papaparse";
import { dataFromBasesValidatorController } from "./dataFromBasesValidatorController.js";
import { getColunsFromTable, getTiposFromTable } from "../model/tableModel.js";
import sanitizeRow from "../utils/sanitizeValue.js"
import createHashByData from "../utils/createHashByData.js";
import normalizar from "../utils/normalizar.js";
import { addAviso, addErro, addInfo} from "../middleware/errorHandler.js";

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
      caminho_original: filePath,
    };

    const logData = {
      tabela_destino: metadados.tabela,
      nome_arquivo: metadados.nome_arquivo,
      ano: parseInt(metadados.ano),
      mes: metadados.mes,
      coluna_data: metadados.coluna_data,
      data_upload: new Date(),
      hash_arquivo: hash,
      caminho_original: filePath,
      sucesso: true,
      mensagem_erro: null,
    };

    return { metadados, logData };
  } catch (e) {
    addErro(
      `Erro ao gerar os objetos fundamentais, metadados e logdata, erro: ${e.message}`
    );
    throw e;
  }
}

export async function createJsonController(filePath) {
  const destino = destinoByFilePath(filePath);
  let buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch (e) {
    addErro(`erro ao ler o arquivo, erro: ${e.message}`);
    throw e
  }

  const data = iconv.decode(buffer, "latin1");
  const firstLine = data.split(/\r?\n/)[0];
  const tabelaName = destino.tabela_destino;

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
      const resumo = [
        `${parsed.errors.length} erros detectados durante o parsing do CSV:`,
      ];

      parsed.errors.slice(0, 5).forEach((err, i) => {
        resumo.push(`→ Linha ${err.row ?? "?"}: ${err.message}`);
      });

      if (parsed.errors.length > 5) {
        resumo.push(
          `→ ...e mais ${parsed.errors.length - 5} erro(s) não exibido(s).`
        );
      }

      addAviso(resumo.join("\n"));
    }
    const linhasValidas = parsed.data.filter((linha) => {
      const valores = Object.values(linha);
      const preenchidos = valores.filter((v) => v?.trim() !== "").length;
      return preenchidos >= 3;
    });
    if (linhasValidas.length === 0) {
      addAviso(`Nenhuma linha válida encontrada no arquivo ${filePath}.`);
    }
    let tiposEsperados;
    try {
      tiposEsperados = await getTiposFromTable(tabelaName);
    } catch (e) {
      addErro(`Erro ao gerar os tipos esperados erro: ${e.message}`);
      throw e
    }

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
    addInfo(`${linhasValidas.length} linhas válidas extraídas de ${filePath}`);
    return dataSanitized;
  } else {
    addErro(`Arquivo ignorado: ${filePath} - Não é um CSV válido`);
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
  } catch (e) {
    addErro(
      `[FATAL] Erro ao extrair informações da tabela destino ou colunas do Json csv, erro: ${e.message}`
    );
    throw e;
  }
}
