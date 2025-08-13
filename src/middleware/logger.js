// middleware/logger.js
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const logPathsByContext = new Map();
const writeQueues = new Map();
// guarda o hash do último STATUS UPDATE por contexto
const lastSnapshotHash = new Map();

export function registerLogFile(contexto, logPath) {
  logPathsByContext.set(contexto, logPath);
}

export function getLogFile(contexto) {
  return logPathsByContext.get(contexto);
}

export async function appendLine(contexto, line) {
  const logFile = getLogFile(contexto);
  if (!logFile) return;
  const prev = writeQueues.get(contexto) || Promise.resolve();
  const next = prev.then(() => fs.appendFile(logFile, line, "utf8")).catch(() => {});
  writeQueues.set(contexto, next);
  await next;
}

// STATUS UPDATE com dedupe
export async function updateLoggerController(dadosLogger, contexto) {
  const ctx =
    typeof contexto === "string"
      ? contexto
      : dadosLogger?.caminho_original || dadosLogger?.filePath || "__global";

  const nome = dadosLogger?.nome_arquivo ?? "—";
  const tabela = dadosLogger?.tabela ?? dadosLogger?.tabela_destino ?? "—";
  const ano = dadosLogger?.ano ?? "—";
  const mes = dadosLogger?.mes ?? "—";
  const dia = dadosLogger?.dia ?? "—";

  const now = new Date().toLocaleString("pt-BR");
  const bloco =
`---------------- STATUS UPDATE ${now} ----------------
Arquivo: ${nome}
Tabela : ${tabela}
Data   : ${ano}-${mes}-${dia}
Acao   : ${dadosLogger?.acao ?? "—"}
Hash   : ${dadosLogger?.hash ?? dadosLogger?.hash_arquivo ?? "—"}
-----------------------------------------------------\n`;

  // calcula hash do snapshot atual
  const hash = crypto.createHash("sha256").update(bloco).digest("hex");

  // se igual ao último, não escreve
  if (lastSnapshotHash.get(ctx) === hash) return;

  lastSnapshotHash.set(ctx, hash);
  await appendLine(ctx, bloco);
}

export async function finalLoggerController(dadosLogger, contexto) {
  const ctx =
    typeof contexto === "string"
      ? contexto
      : dadosLogger?.caminho_original || dadosLogger?.filePath || "__global";
  const now = new Date().toLocaleString("pt-BR");
  await appendLine(ctx, `==== FINAL ${now} ====\n`);
}

export async function createLoggerController(filePath) {
  const dir = path.dirname(filePath);
  const { name } = path.parse(filePath);
  const logDir = path.join(dir, "loggers");
  await fs.mkdir(logDir, { recursive: true });
  const logPath = path.join(logDir, `Logger_${name}.txt`);
  await fs.appendFile(
    logPath,
    `\n==== BEGIN ${new Date().toLocaleString("pt-BR")} ====\n`,
    "utf8"
  );
  registerLogFile(filePath, logPath);
  // zera o dedupe para este contexto ao iniciar novo BEGIN
  lastSnapshotHash.delete(filePath);
}

export function getLoggerContext(metadados = {}, logData = {}, filePath) {
  return {
    ...metadados,
    ...logData,
    caminho_original: filePath ?? metadados?.caminho_original ?? "—",
  };
}
