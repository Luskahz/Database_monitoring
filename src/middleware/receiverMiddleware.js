import fs from "fs";
import path from "path";

function isCsvFile(filePath) {
  return path.extname(filePath).toLowerCase() === ".csv";
}

export default function receiver(filePath, action) {
  try {
    if (isCsvFile(filePath)) {
      if (
        !path.basename(filePath).startsWith("~$") &&
        !filePath.endsWith(".tmp")
      ) {
        fs.readFile(filePath, "utf8", (err, data) => {
          if (err) {
            console.error(`Erro ao ler o arquivo: ${filePath}`, err);
            return;
          }
          const firstLine = data.split("\n")[0];
          if (firstLine.includes(",") || firstLine.includes(";")) {
            // Aqui já está validado e lido, pronto para o controller global
            console.log(`Conteúdo do arquivo: ${data}`);
            console.log(`Arquivo recebido: ${filePath} - Ação: ${action}`);
            // Chame aqui seu controller global, se quiser
          } else {
            console.log(
              `Arquivo ignorado: ${filePath} - Não parece ser um CSV válido`
            );
          }
        });
      } else {
        console.log(`Arquivo ignorado: ${filePath} - Arquivo temporário`);
      }
    } else {
      console.log(`Arquivo ignorado: ${filePath} - Não é um arquivo CSV`);
    }
  } catch (error) {
    console.error(`Erro ao processar o arquivo: ${filePath}`, error);
  }
  // Filtro e leitura em um só lugar
}
