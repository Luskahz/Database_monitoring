import fs from "fs/promises";
import path from "path";
import iconv from "iconv-lite";
import { fileHandlerController } from "../controller/fileHandlerController.js";
import { normalizar } from "../controller/dataFromBasesValidatorController.js";
import { sanitizeRow } from "../model/createSchemaMode.js";
import { getTiposFromTable } from "../model/tableModel.js";

import Papa from "papaparse";

function isCsvFile(filePath) {
  return (
    path.extname(filePath).toLowerCase() === ".csv" ||
    path.extname(filePath).toLowerCase() === ".csv.inf"
  );
}

export default async function receiver(filePath, action, next) {
  const tabelaName = path.basename(path.dirname(path.dirname(filePath)));
  try {
    if (isCsvFile(filePath)) {
      if (
        !path.basename(filePath).startsWith("~$") &&
        !filePath.endsWith(".tmp")
      ) {
        const buffer = await fs.readFile(filePath);
        const data = iconv.decode(buffer, "latin1");
        const firstLine = data.split(/\r?\n/)[0];
        console.log(`row: ${firstLine}`);

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
            console.table(parsed.errors.slice(0, 5)); // exibe só os 5 primeiros erros
          }
          const linhasValidas = parsed.data.filter((linha) => {
            const valores = Object.values(linha);
            const preenchidos = valores.filter((v) => v?.trim() !== "").length;
            return preenchidos >= 3;
          });

          const tiposEsperados = await getTiposFromTable(tabelaName);

          const dataJsonNormalized = linhasValidas.map((linha) => {
            const novaLinha = {};
            for (const chave in linha) {
              novaLinha[normalizar(chave)] = linha[chave];
            }
            return novaLinha;
          });
          const dataSanitized = dataJsonNormalized.map((linha) =>
            sanitizeRow(linha, tiposEsperados)
          );
          fileHandlerController(filePath, dataSanitized, action, next); //AQUI CONTINUA O FLUXO PRO PROXIMO AGENTE
        } else {
          console.log(`Arquivo ignorado: ${filePath} - Não é um CSV válido`);
        }
      } else {
        console.log(`Arquivo ignorado: ${filePath} - Arquivo temporário`);
      }
    } else {
      console.log(`Arquivo ignorado: ${filePath} - Não é um arquivo .CSV`);
    }
  } catch (error) {
    next(error);
  }
}
