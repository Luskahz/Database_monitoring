import fs from "fs/promises";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { addAviso, addErro, addInfo } from "../middleware/errorHandler.js";
import readline from "readline";
import { createReadStream, createWriteStream } from "fs";
import os from "os"; // <-- necessário para OWNER

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OWNER = `${process.pid}@${os.hostname()}`;

// ---------- utils ----------
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Backoff exponencial com jitter simples
function computeDelay(attempt, base = 100, max = 2000) {
  const exp = Math.min(max, base * Math.pow(2, attempt));
  const jitter = Math.floor(exp * (0.3 * Math.random())); // ±30%
  return exp - jitter;
}

// Heartbeat para renovar o lease enquanto a seção crítica estiver ativa
function startHeartbeat(lockFilePath, ttlMs, hardExpiresAt, contexto) {
  const renewEveryMs = Math.max(1000, Math.floor(ttlMs / 2));
  let stopped = false;
  const timer = setInterval(async () => {
    if (stopped) return;
    const payload = {
      owner: OWNER,
      expiresAt: Date.now() + ttlMs, // renovável
      hardExpiresAt, // NÃO é renovado
    };
    try {
      const tmp = lockFilePath + ".tmp";
      await fs.writeFile(tmp, JSON.stringify(payload), "utf8");
      try {
        await fs.rename(tmp, lockFilePath);
      } catch (e) {
        if (e.code === "EPERM" || e.code === "EACCES" || e.code === "EBUSY") {
          await fs.writeFile(lockFilePath, JSON.stringify(payload), "utf8");
        } else {
          throw e;
        }
      }
    } catch (e) {
      addErro(`[lock] Falha ao renovar lease: ${e.message}`, contexto);
    }
  }, renewEveryMs);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

// ---------- lock helpers com CONTEXTO ----------
export async function acquireLock(
  lockFilePath,
  contexto,
  {
    maxWaitMs = 15_000, // pode ser Infinity
    ttlMs = 60_000, // lease renovável (heartbeat)
    hardTtlMs = 30 * 60_000, // LIMITE ABSOLUTO (não é renovado)
    baseDelayMs = 100,
    maxDelayMs = 2000,
    allowStealExpired = true,
    abortSignal = undefined, // opcional
    logEveryMs = 10_000, // log periódico enquanto espera
  } = {}
) {
  const started = Date.now();
  const deadline = Number.isFinite(maxWaitMs) ? started + maxWaitMs : Infinity;
  let attempt = 0;
  let lastLog = 0;

  // helper
  const shouldContinueWaiting = () =>
    Date.now() <= deadline && !abortSignal?.aborted;

  while (shouldContinueWaiting() || !Number.isFinite(deadline)) {
    try {
      const hardExpiresAt = Date.now() + hardTtlMs;
      const payload = {
        owner: OWNER,
        expiresAt: Date.now() + ttlMs,
        hardExpiresAt, // gravado na criação
      };
      await fs.writeFile(lockFilePath, JSON.stringify(payload), { flag: "wx" });

      // adquirido → heartbeat mantém expiresAt, NÃO o hardExpiresAt
      const stopHeartbeat = startHeartbeat(
        lockFilePath,
        ttlMs,
        hardExpiresAt,
        contexto
      );

      // watchdog local: se passar do hardExpiresAt, libere e falhe
      const hardTimer = setTimeout(async () => {
        addErro(
          `[lock] Hard TTL atingido por este processo. Liberando lock.`,
          contexto
        );
        try {
          stopHeartbeat();
        } catch {}
        try {
          await releaseLock(lockFilePath, contexto);
        } catch {}
      }, hardTtlMs).unref?.();

      return { stopHeartbeat, owner: OWNER, ttlMs, hardExpiresAt, hardTimer };
    } catch (e) {
      if (e.code !== "EEXIST") {
        throw new Error(`Erro inesperado ao criar lock: ${e.message}`);
      }

      // Já existe → ler e decidir se espera, limpa, ou toma
      try {
        const raw = await fs.readFile(lockFilePath, "utf8");
        let data = null;
        try {
          data = JSON.parse(raw);
        } catch {}
        const expiresAt = data?.expiresAt ?? 0;
        const hardExpiresAt = data?.hardExpiresAt ?? 0;
        const owner = data?.owner ?? "unknown";
        const now = Date.now();

        // 1) Se passou do HARD TTL → pode tomar posse mesmo com heartbeat
        if (now > hardExpiresAt && allowStealExpired) {
          addAviso(
            `[lock] Hard TTL do dono (${owner}) expirado. Tomando posse...`,
            contexto
          );
          try {
            await fs.unlink(lockFilePath);
          } catch {}
          // tenta imediatamente na próxima iteração
          continue;
        }

        // 2) Se passou do lease TTL (sem heartbeat) → também pode tomar posse
        if (now > expiresAt && allowStealExpired) {
          addAviso(
            `[lock] Lease expirado de ${owner}. Tomando posse...`,
            contexto
          );
          try {
            await fs.unlink(lockFilePath);
          } catch {}
          continue;
        }
      } catch (readErr) {
        // Pode ter sido leitura durante o heartbeat. Aguarde e tente de novo.
        await sleep(computeDelay(attempt++, baseDelayMs, maxDelayMs));
        continue;
      }

      // logs periódicos (enquanto espera)
      const waited = Date.now() - started;
      if (waited - lastLog >= logEveryMs) {
        addInfo(
          `[lock] Aguardando lock há ${Math.round(waited / 1000)}s...`,
          contexto
        );
        lastLog = waited;
      }

      // abort?
      if (abortSignal?.aborted) {
        throw new Error("Lock cancelado via AbortSignal.");
      }

      // backoff + jitter
      await sleep(computeDelay(attempt++, baseDelayMs, maxDelayMs));
    }

    // se tinha deadline finito e passou, sai
    if (Date.now() > deadline && Number.isFinite(deadline)) break;
  }

  // se aqui e era infinito, significa que foi abortado
  if (!Number.isFinite(deadline)) {
    throw new Error("Lock interrompido (provável AbortSignal).");
  }
  throw new Error("Timeout esperando o lock (maxWaitMs atingido).");
}

export async function releaseLock(lockFilePath, contexto) {
  try {
    const raw = await fs.readFile(lockFilePath, "utf8");
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {}
    const owner = data?.owner;

    if (owner && owner !== OWNER) {
      addAviso(`[lock] Lock pertence a ${owner}. Não vou remover.`, contexto);
      return;
    }
  } catch {
    // se não deu pra ler, segue tentando remover (talvez já tenha sumido)
  }
  try {
    await fs.unlink(lockFilePath);
  } catch (err) {
    if (err.code !== "ENOENT") {
      addErro(`[lock] Falha ao remover lock: ${err.message}`, contexto);
    }
  }
}

// Conveniência: garante acquire/release com heartbeat, mesmo se der throw
export async function withFileLock(lockFilePath, contexto, options, fn) {
  const { stopHeartbeat, hardTimer } = await acquireLock(
    lockFilePath,
    contexto,
    options
  );
  try {
    // Faz a função falhar se ultrapassar o hardTtlMs
    let failTimer;
    const failPromise = Number.isFinite(options?.hardTtlMs)
      ? new Promise((_, reject) => {
          failTimer = setTimeout(() => {
            reject(
              new Error(
                `[lock] Hard TTL (${Math.round(
                  (options.hardTtlMs || 0) / 1000
                )}s) atingido: abortando operação.`
              )
            );
          }, options.hardTtlMs).unref?.();
        })
      : new Promise(() => {});

    // Se a função passar do hard TTL, ela rejeita
    return await Promise.race([fn(), failPromise]);
  } finally {
    try {
      clearTimeout(failTimer);
    } catch {}
    try {
      clearTimeout(hardTimer);
    } catch {}
    try {
      stopHeartbeat?.();
    } catch {}
    await releaseLock(lockFilePath, contexto);
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

  // Usa lease curto (append é rápido) e espera razoável
  return withFileLock(
    lockFilePath,
    contexto,
    {
      maxWaitMs: Infinity,
      ttlMs: 30_000,
      hardTtlMs: 5 * 60_000,
      baseDelayMs: 5,
      maxDelayMs: 40,
    },
    async () => {
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

      enqueueCacheLine(cachePath, jsonString + "\n", contexto);
      addInfo(
        `[cache] Salvo no cache: ${tabela_destino}/${ano}-${mes}${
          dia ? "-" + dia : ""
        } (${nome_arquivo}).`,
        contexto
      );
    }
  );
}

export async function getRegisterFromCache(
  destino,
  skipLock = false,
  contexto
) {
  const cachePath = await initCacheFile(destino.tabela_destino);
  const lockFilePath = cachePath + ".lock";

  const readFn = async () => {
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
    }
  };

  if (skipLock) {
    // sem lock — usado quando já há garantia externa
    return readFn();
  }

  // Leitura pode ser lenta em arquivos grandes: TTL maior + heartbeat
  return withFileLock(
    lockFilePath,
    contexto,
    { maxWaitMs: Infinity, ttlMs: 5 * 60_000, hardTtlMs: 15 * 60_000 },
    readFn
  );
}

export async function deleteRegisterFromCache(destino, contexto) {
  const cachePath = await initCacheFile(destino.tabela_destino);
  const lockFilePath = cachePath + ".lock";
  const tempPath = cachePath + ".tmp";

  // Exclusão reescreve arquivo: TTL longo + espera adequada
  return withFileLock(
    lockFilePath,
    contexto,
    { maxWaitMs: Infinity, ttlMs: 30 * 60_000, hardTtlMs: 45 * 60_000 },
    async () => {
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
        rl?.close();
        input?.destroy?.();
      }
    }
  );
}
// topo do módulo
const pendingByFile = new Map(); // cachePath -> { lines: string[], timer: NodeJS.Timeout|null }

function enqueueCacheLine(cachePath, line, contexto) {
  let bucket = pendingByFile.get(cachePath);
  if (!bucket) {
    bucket = { lines: [], timer: null };
    pendingByFile.set(cachePath, bucket);
  }
  bucket.lines.push(line);

  if (!bucket.timer) {
    bucket.timer = setTimeout(async () => {
      const { lines } = bucket;
      bucket.lines = [];
      bucket.timer = null;

      const payload = lines.join(""); // já inclui '\n'
      const lockFilePath = cachePath + ".lock";

      await withFileLock(
        lockFilePath,
        contexto,
        {
          maxWaitMs: Infinity,
          ttlMs: 30_000,
          hardTtlMs: 5 * 60_000,
          baseDelayMs: 5,
          maxDelayMs: 40,
        },
        async () => {
          await fs.appendFile(cachePath, payload, "utf8");
        }
      );
    }, 50); // flush a cada ~50ms (ajuste se quiser)
  }
}
