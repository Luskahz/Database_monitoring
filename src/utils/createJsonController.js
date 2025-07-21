import { destinoByFilePath } from "../controller/createDataController.js";
import { addAviso, addErro, addInfo } from "../middleware/errorHandler.js";
import { getTiposFromTable } from "../model/tableModel.js";
import normalizar from "./normalizar.js";
import sanitizeRow from "./sanitizeValue.js";
import fs from "fs/promises";
import iconv from "iconv-lite";
import Papa from "papaparse";

export default async function createJsonController(filePath) {
  const destino = destinoByFilePath(filePath);
  let buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch (e) {
    throw new Error(`erro ao ler o arquivo, erro: ${e.message}`);
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
      transformHeader: (h) => normalizar(h.trim()),
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
      throw e;
    }

    const dataJsonNormalized = linhasValidas.map((linha) => {
      const novaLinha = {};
      const nomesUsados = {}; // vai registrar quantas vezes um nome foi usado

      for (const chave in linha) {
        let nomeFinal = chave;

        if (nomesUsados[chave]) {
          nomesUsados[chave]++;
          nomeFinal = `${chave}_${nomesUsados[chave]}`;
        } else {
          nomesUsados[chave] = 1;
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