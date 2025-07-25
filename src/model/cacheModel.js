import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { addInfo } from "../middleware/errorHandler.js";
import readline from "readline";
import { createReadStream, createWriteStream } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function acquireLock(
  lockFilePath,
  retries = 10,
  delay = 100,
  timeout = 30000
) {
  for (let i = 0; i < retries; i++) {
    try {
      const now = Date.now();
      const data = now.toString();

      // Tenta criar e escrever o timestamp no lock
      await fs.writeFile(lockFilePath, data, { flag: "wx" });
      return; // Lock criado com sucesso
    } catch (e) {
      if (e.code === "EEXIST") {
        try {
          const conteudo = await fs.readFile(lockFilePath, "utf8");
          const lockTime = parseInt(conteudo.trim(), 10);
          const diff = Date.now() - lockTime;

          if (isNaN(lockTime)) {
            console.warn(
              `[lock] Conteúdo inválido em ${lockFilePath}, forçando remoção`
            );
            await fs.unlink(lockFilePath);
            continue;
          }

          if (diff > timeout) {
            console.warn(
              `[lock] Lock expirado (${diff}ms), removendo ${lockFilePath}`
            );
            await fs.unlink(lockFilePath);
            continue;
          }
        } catch (readErr) {
          console.warn(`[lock] Erro ao ler lock existente: ${readErr.message}`);
        }

        // Espera antes de tentar novamente
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw new Error(`Erro inesperado ao tentar criar lock: ${e.message}`);
      }
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
    console.info(
      `[lock] Lock '${lockFilePath}' não existe mais, nada a remover.`
    );
    return;
  }

  try {
    await fs.unlink(lockFilePath);
  } catch (err) {
    console.warn(
      `[lock] Falha ao remover lock, tentando novamente: ${err.message}`
    );

    // Tenta remover novamente com um pequeno delay
    try {
      await new Promise((r) => setTimeout(r, 100));

      // Verifica novamente antes de tentar apagar
      if (await fileExists(lockFilePath)) {
        await fs.unlink(lockFilePath);
        console.info("[lock] Lock removido com sucesso na segunda tentativa.");
      } else {
        console.info(
          `[lock] Lock '${lockFilePath}' foi removido por outro processo antes da segunda tentativa.`
        );
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
      console.log(
        `Arquivo de cache criado para a tabela ${tabela} em:`,
        cacheFilePath
      );
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

    const enrichedLogData = {
      ...logData,
      identificador: parts.join("_"),
    };
    const jsonString = JSON.stringify(enrichedLogData);
    if (!jsonString) throw new Error("Erro ao serializar logData");

    await fs.appendFile(cachePath, jsonString + "\n", "utf8");
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

  // monta o identificador
  const { tabela_destino, ano, mes, dia, nome_arquivo } = destino;
  const parts = [tabela_destino, ano, mes];
  if (dia !== undefined && dia !== null && dia !== "") {
    parts.push(dia);
  }
  parts.push(nome_arquivo);
  const identificador = parts.join("_");
  let rl, input;

  try {
    input = createReadStream(cachePath);
    rl = readline.createInterface({ input, crlfDelay: Infinity });

    for await (const line of rl) {
      try {
        const obj = JSON.parse(line);
        if (obj.identificador === identificador) {
          return obj;
        }
      } catch (e) {
        console.warn(`[cache] Linha inválida ignorada: ${line}`);
      }
    }

    // não encontrou
    return null;
  } catch (e) {
    throw new Error(`[cache] Erro ao buscar no cache: ${e.message}`);
  } finally {
    if (rl) rl.close();
    if (input) input?.destroy();
    if (!skipLock) await releaseLock(lockFilePath);
  }
}

export async function deleteRegisterFromCache(destino) {
  const cachePath = await initCacheFile(destino.tabela_destino);
  const lockFilePath = cachePath + ".lock";
  const tempPath = cachePath + ".tmp";

  await acquireLock(lockFilePath, 10, 200);

  // monta identificador
  const { tabela_destino, ano, mes, dia, nome_arquivo } = destino;
  const parts = [tabela_destino, ano, mes];
  if (dia !== undefined && dia !== null && dia !== "") {
    parts.push(dia);
  }
  parts.push(nome_arquivo);
  const identificadorAlvo = parts.join("_");
  let rl, output, input;
  try {
    input = createReadStream(cachePath);
    rl = readline.createInterface({ input, crlfDelay: Infinity });
    output = createWriteStream(tempPath, { flags: "w" });
    let encontrado = false;

    for await (const line of rl) {
      try {
        const obj = JSON.parse(line);
        if (obj.identificador === identificadorAlvo) {
          encontrado = true;
          continue; // não escreve essa linha (é o alvo)
        }
        output.write(line + "\n");
      } catch {
        // se a linha for inválida, preserva por segurança
        output.write(line + "\n");
      }
    }

    try {
      output.end();
      await new Promise((res, rej) => {
        output.on("finish", res);
        output.on("error", rej);
      });
    } finally {
      output?.close?.();
    }

    if (!encontrado) {
      throw new Error(
        `[cache] Registro '${identificadorAlvo}' não encontrado no cache.`
      );
    }

    await fs.rename(tempPath, cachePath);
    addInfo(
      `[cache JSONL] Registro '${identificadorAlvo}' removido com sucesso.`
    );
    return true;
  } catch (e) {
    throw new Error(`[cache JSONL] Erro ao excluir registro: ${e.message}`);
  } finally {
    if (await fileExists(tempPath)) {
      await fs.unlink(tempPath).catch(() => {});
    }
    await releaseLock(lockFilePath);
    if (rl) rl.close();
    if (input) input.close?.();
  }
}
