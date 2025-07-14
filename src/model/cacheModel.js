import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const cachePath = path.resolve(__dirname, "cache", "cacheHash.txt");

async function initCacheFile() {
  await fs.mkdir(dirPath, { recursive: true });
  try {
    await fs.access(filePath);
  } catch (err) {
    await fs.writeFile(filePath, "", "utf8");
    console.log("Arquivo de cache criado em:", filePath);
  }
}

export async function insertHashInCache(logData) {
  logData.identificador = `${logData.tabela_destino}_${logData.ano}_$${logData.mes}_${logData.nome_arquivo}`;
  const jsonString = JSON.stringify(obj, null, 2);

  await fs.appendFile(filePath, jsonString + "\n\n", "utf8");
  console.log("Objeto salvo com sucesso!");
}

export async function getRegisterFromCache(filePath) {
  const fileName = path.basename(filePath); // exemplo: junho.csv
  const baseMes = path.basename(filePath, path.extname(filePath)); //ex: junho
  const baseAno = path.basename(path.dirname(filePath)); // exemplo: 2023
  const tabelaName = path.basename(path.dirname(path.dirname(filePath))); // exemplo: 03_11_40

  const identificador = `${tabelaName}_${baseAno}_${baseMes}_${fileName}`;

  try {
    const conteudo = await fs.readFile(cachePath, "utf8");

    const blocos = conteudo
      .split("\n\n")
      .map((b) => b.trim())
      .filter(Boolean);

    const registros = blocos
      .map((json) => {
        try {
          return JSON.parse(json);
        } catch (err) {
          console.warn(
            "⚠️ Erro ao fazer parse de um bloco do cache:",
            err.message
          );
          return null;
        }
      })
      .filter(Boolean);

    return registros.find((reg) => reg.identificador === identificador) || null;
  } catch (err) {
    console.error("❌ Erro ao ler o cache:", err.message);
    return null;
  }
}


export async function deletRegisterFromCache(){

}
