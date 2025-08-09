import { destinoByFilePath } from "../controller/createDataController.js";
import { addAviso, addInfo } from "../middleware/errorHandler.js";
import { getTiposFromTable } from "../model/tableModel.js";
import normalizar from "./normalizar.js";
import sanitizeRow from "./sanitizeValue.js";
import fs from "fs/promises";
import iconv from "iconv-lite";
import Papa from "papaparse";
import chardet from "chardet";

function detectarColunasDuplicadas(headers, contexto) {
  const set = new Set();
  const duplicadas = [];

  for (const col of headers) {
    if (set.has(col)) duplicadas.push(col);
    set.add(col);
  }

  if (duplicadas.length > 0) {
    addAviso(
      `[Json] - Colunas duplicadas detectadas e renomeadas: ${duplicadas.join(
        ", "
      )}`,
      contexto
    );
  }
}

function logarErrosDoParse(errors, contexto) {
  if (!errors.length) return;

  const resumo = [
    `${errors.length} [Json] erros detectados durante o parsing do CSV:`,
  ];

  errors.slice(0, 5).forEach((err) => {
    resumo.push(`[Json] → Linha ${err.row ?? "?"}: ${err.message}`);
  });

  if (errors.length > 5) {
    resumo.push(
      `[Json] → ...e mais ${errors.length - 5} erro(s) não exibido(s).`
    );
  }

  addAviso(resumo.join("\n"), contexto);
}

function limparCamposExtras(data) {
  return data.map((linha) => {
    if ("__parsed_extra" in linha) delete linha.__parsed_extra;
    return linha;
  });
}

function normalizarCabecalhosEValores(linha, contexto) {
  const novaLinha = {};
  const nomesUsados = {};

  Object.entries(linha).forEach(([chave, valor], i) => {
    let nomeFinal = chave?.trim() || `unnamed_${i + 1}`;

    if (!chave?.trim()) {
      addAviso(
        `[parser CSV] Coluna sem nome detectada na posição ${i}. Nomeada como '${nomeFinal}'`,
        contexto
      );
    }

    if (nomesUsados[nomeFinal]) {
      nomesUsados[nomeFinal]++;
      nomeFinal = `${nomeFinal}_${nomesUsados[nomeFinal]}`;
    } else {
      nomesUsados[nomeFinal] = 1;
    }

    novaLinha[nomeFinal] = valor;
  });

  return novaLinha;
}

// =================== Função principal ===================

export default async function createJsonController(filePath) {
  try {
    const contexto = filePath;
    const destino = destinoByFilePath(filePath);
    const tabelaName = destino.tabela_destino;

    let buffer;
    try {
      buffer = await fs.readFile(filePath);
    } catch (e) {
      throw new Error(`[Json] - erro ao ler o arquivo, erro: ${e.message}`);
    }
    let data;
    const detectedEncoding = chardet.detect(buffer);

    try {
      if (detectedEncoding === "UTF-8") {
        data = iconv.decode(buffer, "utf8");
      } else if (
        detectedEncoding === "ISO-8859-1" ||
        detectedEncoding === "ISO-8859-2"
      ) {
        data = iconv.decode(buffer, "latin1"); // Latin-1 cobre ISO-8859-1 e ISO-8859-2
      } else {
        
        addAviso(
          `Codificação ${detectedEncoding} não suportada, utilizando UTF-8 como padrão.`
        );
        data = iconv.decode(buffer, "utf8");
      }
    } catch (e) {
      throw new Error(`[Json] - Erro ao decodificar o arquivo: ${e.message}`);
    }

    const firstLine = data.split(/\r?\n/)[0];

    const linhas = data.split(/\r\n|\n|\r/);
    if (linhas.length < 2) {
      throw new Error(
        `[Json] Arquivo ignorado: ${filePath} - Não há dados após o header`
      );
    }

    const delimiter = firstLine.includes(";") ? ";" : ",";
    const parsed = Papa.parse(data, {
      header: true,
      delimiter,
      skipEmptyLines: true,
      transformHeader: (h) => {
        if (!h) return "unnamed";
        let header = normalizar(h);
        header = header.replace(/[\u0000-\u001F\u007F]/g, "");
        return header === "" ? "unnamed" : header;
      },
      transform: (value) => value.trim(),
    });
  
    detectarColunasDuplicadas(parsed.meta?.fields, contexto);
    logarErrosDoParse(parsed.errors, contexto);

    const linhasCorrigidas = limparCamposExtras(parsed.data);

    if (linhasCorrigidas.length === 0) {
      addAviso(
        `[Json] - Nenhuma linha válida encontrada no arquivo ${filePath}.`,
        contexto
      );
    }

    let tiposEsperados;
    try {
      tiposEsperados = await getTiposFromTable(tabelaName);
    } catch (e) {
      throw new Error(
        `[Json] - erro ao gerar os tipos esperados, [erro: ${e.message}]`
      );
    }

    const dataSanitized = linhasCorrigidas
      .map((linha) => normalizarCabecalhosEValores(linha, contexto))
      .map((linha) => sanitizeRow(linha, tiposEsperados));

    addInfo(
      `[Json] - ${linhasCorrigidas.length} linhas válidas extraídas de ${filePath}`,
      contexto
    );
    return dataSanitized;
  } catch (e) {
    throw e;
  }
}
