import fs from "fs/promises";
import path from "path";
import iconv from "iconv-lite";
import { fileHandlerController } from "../controller/fileHandlerController.js";
import csvtojson from "csvtojson";

function isCsvFile(filePath) {
  return path.extname(filePath).toLowerCase() === ".csv" || 
         path.extname(filePath).toLowerCase() === ".csv.inf";
}

export default async function receiver(filePath, action, next) {
  try {
    if (isCsvFile(filePath)) {
      if (!path.basename(filePath).startsWith("~$") && !filePath.endsWith(".tmp")) {
        const buffer = await fs.readFile(filePath)
        const data = iconv.decode(buffer, "latin1");
        const firstLine = data.split(/\r?\n/)[0];

        
        if (firstLine.includes(",") || firstLine.includes(";")) {
            const delimiter = firstLine.includes(";") ? ";" : ",";
            const dataJson =  await csvtojson({ delimiter }).fromString(data)
            fileHandlerController(filePath, dataJson, action) //AQUI CONTINUA O FLUXO PRO PROXIMO AGENTE
        } else {
          console.log(
            `Arquivo ignorado: ${filePath} - Não parece ser um CSV válido`
          );
        }
      } else {
        console.log(`Arquivo ignorado: ${filePath} - Arquivo  temporário`);
      }
    } else {
      console.log(`Arquivo ignorado: ${filePath} - Não é um arquivo CSV`);
    }
  } catch (error) {
    next(error)
  }

}
