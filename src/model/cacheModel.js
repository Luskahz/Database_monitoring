import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { error } from "console";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const cachePath = path.resolve(__dirname, "../cache", "cacheHash.txt");

async function initCacheFile() {
  const dirPath = path.dirname(cachePath);
  await fs.mkdir(dirPath, { recursive: true });
  try {
    await fs.access(cachePath);
    return cachePath;
  } catch (err) {
    await fs.writeFile(cachePath, "", "utf8");
    console.log("Arquivo de cache criado em:", cachePath);
    return cachePath;
  }
}

export async function insertHashInCache(logData) {
  try {
    const cachePath = await initCacheFile();
    logData.identificador = `${logData.tabela_destino}_${logData.ano}_${logData.mes}_${logData.nome_arquivo}`;
    const jsonString = JSON.stringify(logData, null, 2);
    await fs.appendFile(cachePath, jsonString + "\n\n", "utf8");
    console.log("Objeto salvo no cache com sucesso!");
  } catch (error) {
    console.error(
      `houve um problema ao gerar registro no cache erro: ${error.message}`
    );
  }
}

export async function getRegisterFromCache(destino) {
  const identificador = `${destino.tabela_destino}_${destino.ano}_${destino.mes}_${destino.nome_arquivo}`;
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

export async function deletRegisterFromCache(destino) {
  const registroAlvo = await getRegisterFromCache(destino);
  if (!registroAlvo) {
    console.log("⚠️ Registro não encontrado no cache. Nada foi removido.");
    return false;
  }

  try {
    const conteudo = await fs.readFile(cachePath, "utf8");
    const blocos = conteudo
      .split("\n\n")
      .map((b) => b.trim())
      .filter(Boolean);

    const blocosMantidos = blocos.filter((bloco) => {
      try {
        const obj = JSON.parse(bloco);
        return obj.identificador !== registroAlvo.identificador;
      } catch {
        return true;
      }
    });

    const novoConteudo = blocosMantidos.join("\n\n") + "\n\n";
    await fs.writeFile(cachePath, novoConteudo, "utf8");
    console.log(
      `✅ Registro '${registroAlvo.identificador}' removido com sucesso!`
    );
    return true;
  } catch (err) {
    console.error("❌ Erro ao tentar deletar registro do cache:", err.message);
    return false;
  }
}
