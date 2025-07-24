import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { addInfo } from "../middleware/errorHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);



async function acquireLock(lockFilePath, retries = 10, delay = 100) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.open(lockFilePath, "wx"); // tenta criar lock - 'wx' falha se já existe
      return; // lock obtido com sucesso
    } catch (e) {
      if (e.code !== "EEXIST") {
        throw new Error(`Erro inesperado ao tentar criar lock: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Não foi possível obter lock após várias tentativas");
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function releaseLock(lockFilePath) {
  // Verifica se o arquivo lock existe antes de tentar apagar
  const exists = await fileExists(lockFilePath);
  if (!exists) {
    console.info(`[lock] Lock '${lockFilePath}' não existe mais, nada a remover.`);
    return;
  }

  try {
    await fs.unlink(lockFilePath);
  } catch (err) {
    console.warn(`[lock] Falha ao remover lock, tentando novamente: ${err.message}`);

    // Tenta remover novamente com um pequeno delay
    try {
      await new Promise((r) => setTimeout(r, 100));

      // Verifica novamente antes de tentar apagar
      if (await fileExists(lockFilePath)) {
        await fs.unlink(lockFilePath);
        console.info("[lock] Lock removido com sucesso na segunda tentativa.");
      } else {
        console.info(`[lock] Lock '${lockFilePath}' foi removido por outro processo antes da segunda tentativa.`);
      }
    } catch (err2) {
      console.error(`[lock] Falha crítica ao remover lock: ${err2.message}`);
      // Aqui você pode incluir lógica para alertar o time ou monitorar esse problema
    }
  }
}

async function initCacheFile(tabela) {
  try {
    const dirPath = path.resolve(__dirname, "../cache");
    await fs.mkdir(dirPath, { recursive: true });

    // Aqui cria o caminho do arquivo cache específico para a tabela
    const cacheFilePath = path.resolve(dirPath, `cacheHash_${tabela}.txt`);

    try {
      await fs.access(cacheFilePath);
      return cacheFilePath;
    } catch (err) {
      await fs.writeFile(cacheFilePath, "", "utf8");
      console.log(`Arquivo de cache criado para a tabela ${tabela} em:`, cacheFilePath);
      return cacheFilePath;
    }
  } catch (e) {
    throw new Error(`erro ao iniciar o arquivo cache, erro: ${e.message}`);
  }
}

export async function insertHashInCache(logData) {
  const { tabela_destino, ano, mes, dia, nome_arquivo } = logData;
  let cachePath;
  try {
    cachePath = await initCacheFile(tabela_destino);
  } catch (e) {
    throw new Error(
      `[model cache] erro ao criar o arquivo do cache: ${e.message}`
    );
  }

  // implementando logica de lock
  const lockFilePath = cachePath + ".lock";
  await acquireLock(lockFilePath, 10, 200);

  try {
    const parts = [tabela_destino, ano, mes];
    if (dia !== undefined && dia !== null && dia !== "") {
      parts.push(dia);
    }
    parts.push(nome_arquivo);

    logData.identificador = parts.join("_");

    const jsonString = JSON.stringify(logData, null, 2);
    await fs.appendFile(cachePath, jsonString + "\n\n", "utf8");
    addInfo("[model cache] Objeto salvo no cache com sucesso!");
  } catch (e) {
    throw new Error(
      `erro gerado ao inserir o hash no cache, erro: ${e.message}`
    );
  } finally {
    await releaseLock(lockFilePath);
  }
}

export async function getRegisterFromCache(destino, skipLock = false) {
  const cachePath = await initCacheFile(destino.tabela_destino);
  const lockFilePath = cachePath + ".lock";
  if (!skipLock) await acquireLock(lockFilePath, 10, 200);

  try {
    const { tabela_destino, ano, mes, dia, nome_arquivo } = destino;
    try {
      // Monta o identificador igual ao insertHashInCache:
      const parts = [tabela_destino, ano, mes];
      if (dia !== undefined && dia !== null && dia !== "") {
        parts.push(dia);
      }
      parts.push(nome_arquivo);
      const identificador = parts.join("_");

      let conteudo;
      try {
        conteudo = await fs.readFile(cachePath, "utf8");
      } catch (e) {
        throw new Error(
          `[model cache] Erro ao ler o arquivo no cache, caminho do cache: '${cachePath}' erro: ${e.message}`
        );
      }
      const blocos = conteudo
        .split("\n\n")
        .map((b) => b.trim())
        .filter(Boolean);

      const registros = blocos
        .map((json) => {
          try {
            return JSON.parse(json);
          } catch (e) {
            throw new Error(
              `[model cache] Erro ao fazer parse de um bloco do cache, erro: ${e.message}`
            );
          }
        })
        .filter(Boolean);

      const encontrado = registros.find(
        (reg) => reg.identificador === identificador
      );
      return encontrado
    } catch (e) {
      throw new Error(`erro ao puxar o registro do cache: ${e.message}`);
    }
  } catch (e) {
    throw new Error(`Erro ao puxar um um dado do cache, erro: ${e.message}`);
  } finally {
    if (!skipLock) await releaseLock(lockFilePath);
  }
}

export async function deleteRegisterFromCache(destino) {
  const cachePath = await initCacheFile(destino.tabela_destino);
  const lockFilePath = cachePath + ".lock";
  await acquireLock(lockFilePath, 10, 200);

  try {
    let registroAlvo;
    try {
      registroAlvo = await getRegisterFromCache(destino, true);
    } catch (e) {
      throw new Error(
        `[model cache] Erro ao coletar os registros do cache, erro: ${e.message}`
      );
    }

    if (!registroAlvo) {
      throw new Error(
        " [model cache] Registro não encontrado no cache. Nada foi removido."
      );
    }
    let conteudo;
    try {
      conteudo = await fs.readFile(cachePath, "utf8");
    } catch (e) {
      throw new Error(`[model cache] Erro ao ler o cache ${e.message}`);
    }

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
    try {
      await fs.writeFile(cachePath, novoConteudo, "utf8");
      addInfo(
        `[model cache] Registro '${registroAlvo.identificador}' removido com sucesso do cache!`
      );
    } catch (e) {
      throw new Error(
        `[model cache] Erro ao reescrever os dados sem o registro removido no cache!, erro: ${e.message}`
      );
    }
    return true;
  } catch (e) {
    throw new Error(`erro ao deletar um registro do cache, erro: ${e.message}`);
  } finally {
    await releaseLock(lockFilePath);
  }
}
