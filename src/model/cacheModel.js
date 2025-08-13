import fs from "fs/promises";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { addAviso, addErro, addInfo } from "../middleware/errorHandler.js";
import readline from "readline";
import { createReadStream, createWriteStream } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------- utils ----------
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ---------- lock helpers com CONTEXTO ----------
async function acquireLock(
  lockFilePath,
  contexto,
  { retries = 20, delay = 200, timeout = 60000 } = {}
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

          if (Number.isNaN(lockTime)) {
            addInfo(
              `[lock] Conteúdo inválido em ${lockFilePath} (esperava timestamp). Removendo lock corrompido.`,
              contexto
            );
            try {
              await fs.unlink(lockFilePath);
            } catch (e2) {
              addErro(
                `[lock] Erro ao remover lock corrompido: ${e2.message}`,
                contexto
              );
            }
            continue;
          }

          if (diff > timeout) {
            addInfo(
              `[lock] Lock expirado (${diff}ms). Removendo ${lockFilePath}.`,
              contexto
            );
            try {
              await fs.unlink(lockFilePath);
            } catch (e3) {
              addErro(
                `[lock] Erro ao excluir lock expirado: ${e3.message}`,
                contexto
              );
            }
            continue;
          }
        } catch (readErr) {
          addErro(
            `[lock] Erro ao ler lock existente: ${readErr.message}`,
            contexto
          );
        }

        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw new Error(`Erro inesperado ao criar lock: ${e.message}`);
      }
    }
  }
  throw new Error("Não foi possível obter lock após várias tentativas");
}

async function releaseLock(lockFilePath, contexto) {
  const exists = await fileExists(lockFilePath);
  if (!exists) {
    addAviso(
      `[lock] '${lockFilePath}' não existe mais (nada a remover).`,
      contexto
    );
    return;
  }

  try {
    await fs.unlink(lockFilePath);
  } catch (err) {
    addErro(
      `[lock] Falha ao remover lock, tentando novamente: ${err.message}`,
      contexto
    );
    try {
      await new Promise((r) => setTimeout(r, 100));
      if (await fileExists(lockFilePath)) {
        await fs.unlink(lockFilePath);
        addInfo(
          "[lock] Lock removido com sucesso na segunda tentativa.",
          contexto
        );
      } else {
        addInfo(
          `[lock] '${lockFilePath}' foi removido por outro processo antes da segunda tentativa.`,
          contexto
        );
      }
    } catch (err2) {
      addErro(
        `[lock] Falha crítica ao remover lock: ${err2.message}`,
        contexto
      );
    }
  }
}

// ---------- cache file ----------
async function initCacheFile(tabela) {
  try {
    const dirPath = path.resolve(__dirname, "../cache");
    await fs.mkdir(dirPath, { recursive: true });

    const cacheFilePath = path.resolve(dirPath, `cacheHash_${tabela}.jsonl`);

    try {
      await fs.access(cacheFilePath);
      return cacheFilePath;
    } catch {
      await fs.writeFile(cacheFilePath, "", "utf8");
      console.log(
        `Arquivo de cache criado para a tabela ${tabela} em:`,
        cacheFilePath
      );
      return cacheFilePath;
    }
  } catch (e) {
    throw new Error(`erro ao iniciar o arquivo cache: ${e.message}`);
  }
}

// ---------- API ----------
export async function insertHashInCache(logData, contexto) {
  const { tabela_destino, ano, mes, dia, nome_arquivo } = logData;

  let cachePath;
  try {
    cachePath = await initCacheFile(tabela_destino);
  } catch (e) {
    throw new Error(
      `[model cache] erro ao criar o arquivo de cache: ${e.message}`
    );
  }

  const lockFilePath = cachePath + ".lock";
  await acquireLock(lockFilePath, contexto, { retries: 10, delay: 200 });

  try {
    const parts = [tabela_destino, ano, mes];
    if (dia !== undefined && dia !== null && dia !== "") parts.push(dia);
    parts.push(nome_arquivo);

    const enrichedLogData = {
      ...logData,
      identificador: parts.join("_"),
    };

    const jsonString = JSON.stringify(enrichedLogData);
    if (!jsonString)
      throw new Error("[hash in cache] Erro ao serializar logData");

    await fs.appendFile(cachePath, jsonString + "\n", "utf8");
    addInfo(
      `[cache] Salvo no cache: ${tabela_destino}/${ano}-${mes}${
        dia ? "-" + dia : ""
      } (${nome_arquivo}).`,
      contexto
    );
  } catch (e) {
    throw new Error(`Erro ao inserir hash no cache: ${e.message}`);
  } finally {
    await releaseLock(lockFilePath, contexto);
  }
}

export async function getRegisterFromCache(
  destino,
  skipLock = false,
  contexto
) {
  const cachePath = await initCacheFile(destino.tabela_destino);
  const lockFilePath = cachePath + ".lock";
  if (!skipLock)
    await acquireLock(lockFilePath, contexto, { retries: 10, delay: 200 });

  const { tabela_destino, ano, mes, dia, nome_arquivo } = destino;
  const parts = [tabela_destino, ano, mes];
  if (dia !== undefined && dia !== null && dia !== "") parts.push(dia);
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
      } catch {
        // linha inválida -> ignora
      }
    }
    return null;
  } catch (e) {
    throw new Error(`[cache] Erro ao buscar no cache: ${e.message}`);
  } finally {
    rl?.close();
    input?.destroy?.();
    if (!skipLock) await releaseLock(lockFilePath, contexto);
  }
}

export async function deleteRegisterFromCache(destino, contexto) {
  const cachePath = await initCacheFile(destino.tabela_destino);
  const lockFilePath = cachePath + ".lock";
  const tempPath = cachePath + ".tmp";

  await acquireLock(lockFilePath, contexto, { retries: 20, delay: 500 });

  const { tabela_destino, ano, mes, dia, nome_arquivo } = destino;
  const parts = [tabela_destino, ano, mes];
  if (dia !== undefined && dia !== null && dia !== "") parts.push(dia);
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
          continue; // não escreve (removendo alvo)
        }
        output.write(line + "\n");
      } catch {
        // preserva linhas inválidas por segurança
        output.write(line + "\n");
      }
    }

    await new Promise((res, rej) => {
      output.end();
      output.on("finish", res);
      output.on("error", rej);
    });

    if (!encontrado) {
      throw new Error(
        `[cache] Registro '${identificadorAlvo}' não encontrado.`
      );
    }

    await fs.rename(tempPath, cachePath);
    addInfo(`[cache] Registro removido: '${identificadorAlvo}'.`, contexto);
    return true;
  } catch (e) {
    throw new Error(`[cache] Erro ao excluir registro: ${e.message}`);
  } finally {
    try {
      if (await fileExists(tempPath)) await fs.unlink(tempPath);
    } catch {}
    await releaseLock(lockFilePath, contexto);
    rl?.close();
    input?.destroy?.();
  }
}
