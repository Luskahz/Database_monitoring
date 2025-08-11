import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import {
  addAviso,
  addErro,
  addInfo,
  clearAllErrors,
} from "../middleware/errorHandler.js";
import readline from "readline";
import { createReadStream, createWriteStream } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function acquireLock(
  lockFilePath,
  retries = 20,
  delay = 200,
  timeout = 60000
) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.writeFile(lockFilePath, Date.now().toString(), { flag: "wx" });
      return;
    } catch (e) {
      if (e.code === "EEXIST") {
        try {
          const conteudo = await fs.readFile(lockFilePath, "utf8");
          const lockTime = parseInt(conteudo.trim(), 10);
          const diff = Date.now() - lockTime;

          if (isNaN(lockTime)) {
            //remove o locker se não for um numero, visando liberar a fila de espera
            addInfo(
              `[locker] Conteúdo inválido em ${lockFilePath}, script esperava a data, forçando remoção`
            );
            try {
              await fs.unlink(lockFilePath);
            } catch (e) {
              addErro("[locker] erro ao remover o locker");
            }
            continue;
          }

          if (diff > timeout) {
            // se a diferença for maior que o time out, esse locker tá vencido,
            addInfo(
              `[lock] Lock expirado (${diff}ms), removendo ${lockFilePath}`
            );
            try {
              await fs.unlink(lockFilePath);
            } catch (e) {
              addErro("erro ao excluir o locker, pós locker vencido");
            }
            continue;
          }
        } catch (readErr) {
          addErro(`[lock] Erro ao ler lock existente: ${readErr.message}`);
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
  const contexto = lockFilePath;
  clearAllErrors(contexto);
  // Verifica se o arquivo lock existe antes de tentar apagar
  const exists = await fileExists(lockFilePath);
  if (!exists) {
    addAviso(`[loc] Lock '${lockFilePath}' não existe mais, nada a remover.`, contexto);
    return;
  }

  try {
    await fs.unlink(lockFilePath);
  } catch (err) {
    addErro(`[lock] Falha ao remover lock, tentando novamente: ${err.message}`, contexto);
    try {
      await new Promise((r) => setTimeout(r, 100));

      if (await fileExists(lockFilePath)) {
        await fs.unlink(lockFilePath);
        addInfo("[lock] Lock removido com sucesso na segunda tentativa.", contexto);
      } else {
        addInfo(
          `[lock] Lock '${lockFilePath}' foi removido por outro processo antes da segunda tentativa.`, contexto
        );
      }
    } catch (err2) {
      addErro(
        `[lock] Falha crítica ao remover lock: ${err2.message} informar ao Lucas`, contexto
      );
    }
  }
}

async function initCacheFile(tabela) {
  try {
    const dirPath = path.resolve(__dirname, "../cache");
    await fs.mkdir(dirPath, { recursive: true });

    // Aqui cria o caminho do arquivo cache específico para a tabela
    const cacheFilePath = path.resolve(dirPath, `cacheHash_${tabela}.jsonl`);

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
    console.log(logData)

    const enrichedLogData = {
      ...logData,
      identificador: parts.join("_"),
    };
    const jsonString = JSON.stringify(enrichedLogData);
    if (!jsonString)
      throw new Error("[hash in cache] Erro ao serializar logData");

    await fs.appendFile(cachePath, jsonString + "\n", "utf8");
    addInfo(`[FINALIZADO] Objeto salvo no cache com sucesso! processo de inserção do ${mes} - ${dia} na tabela ${tabela_destino} finalizado!`, lockFilePath);
  } catch (e) {
    throw new Error(
      `Erro gerado ao inserir o hash no cache, erro: ${e.message}`
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

  await acquireLock(lockFilePath, 20, 500);

  // monta identificador
  const { tabela_destino, ano, mes, dia, nome_arquivo } = destino;
  const parts = [tabela_destino, ano, mes];
  if (dia !== undefined && dia !== null && dia !== "") {
    parts.push(dia);
  }
  parts.push(nome_arquivo);
  const identificadorAlvo = parts.join("_");

  // inicia logica do delete
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
        `[cache] Registro '${identificadorAlvo}' não encontrado no cache [Script finalizado].`
      );
    }
    try {
      await fs.rename(tempPath, cachePath);
    } catch (e) {
      throw new Error(
        `[cache file] Erro ao substituir o cache pelo cache temp durante a logica de exclusão de um registro do cache`
      );
    }

    addInfo(
      `[cache JSONL] Registro '${identificadorAlvo}' removido com sucesso processo de remoção finalizado!.`, lockFilePath
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
