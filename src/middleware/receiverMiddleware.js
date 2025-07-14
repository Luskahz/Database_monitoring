import path from "path";
import { fileHandlerController } from "../controller/fileHandlerController.js";
import { createJsonController } from "../controller/createDataController.js";

function isCsvFile(filePath) {
  return (
    path.extname(filePath).toLowerCase() === ".csv" ||
    path.extname(filePath).toLowerCase() === ".csv.inf"
  );
}

export default async function receiver(filePath, action, next) {
  try {
    if (isCsvFile(filePath)) {
      if (
        !path.basename(filePath).startsWith("~$") &&
        !filePath.endsWith(".tmp")
      ) {
        const dataJson = await createJsonController(filePath);
        if (dataJson && dataJson.length > 0) {
          fileHandlerController(filePath, dataJson, action, next);
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
