import { destinoByFilePath } from "../controller/createDataController.js";
import { addAviso, addInfo } from "../middleware/errorHandler.js";
import { getTiposFromTable } from "../model/tableModel.js";
import normalizar from "./normalizar.js";
import sanitizeRow from "./sanitizeValue.js";
import fs from "fs/promises";
import iconv from "iconv-lite";
import Papa from "papaparse";

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

function filtrarLinhasValidas(data) {
  return data.filter((linha) => {
    const extras =
      Array.isArray(linha.__parsed_extra) && linha.__parsed_extra.length > 0;
    const preenchidos = Object.values(linha).filter(
      (v) => typeof v === "string" && v.trim() !== ""
    ).length;
    return preenchidos >= 3 && !extras;
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
  const contexto = filePath;
  const destino = destinoByFilePath(filePath);
  const tabelaName = destino.tabela_destino;

  let buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch (e) {
    throw new Error(`[Json] - erro ao ler o arquivo, erro: ${e.message}`);
  }

  const data = iconv.decode(buffer, "latin1");
  const firstLine = data.split(/\r?\n/)[0];

  if (!(firstLine.includes(",") || firstLine.includes(";"))) {
    throw new Error(
      `[Json]  Arquivo ignorado: ${filePath} - Não é um CSV válido`
    );
  }

  const delimiter = firstLine.includes(";") ? ";" : ",";
  const parsed = Papa.parse(data, {
    header: true,
    delimiter,
    skipEmptyLines: true,
    transformHeader: (h) => {
      const header = h?.trim?.() ?? "";
      return header === "" ? "unnamed" : normalizar(header);
    },
    transform: (value) => value.trim(),
  });

  detectarColunasDuplicadas(parsed.meta?.fields, contexto);
  logarErrosDoParse(parsed.errors, contexto);

  const linhasCorrigidas = limparCamposExtras(parsed.data);
  const linhasValidas = filtrarLinhasValidas(linhasCorrigidas);

  if (linhasValidas.length === 0) {
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

  const dataSanitized = linhasValidas
    .map((linha) => normalizarCabecalhosEValores(linha, contexto))
    .map((linha) => sanitizeRow(linha, tiposEsperados));

  addInfo(
    `[Json] - ${linhasValidas.length} linhas válidas extraídas de ${filePath}`,
    contexto
  );
  return dataSanitized;
}
