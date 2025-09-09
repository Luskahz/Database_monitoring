import fs from "fs/promises";
import path from "path";
import { addAviso, addErro, addInfo } from "../middleware/errorHandler.js";

/* ────────────────────────────────────────────────────────────────────────── */
/* Estado                                                                     */
/* ────────────────────────────────────────────────────────────────────────── */
const logPathsByContext = new Map();
const writeQueues = new Map();
const lastSnapshotHash = new Map(); // dedupe STATUS
const ensuredLogDirs = new Set();

// Metadados do contexto para output compacto
// key(ctx) -> { fullPath, shortTag, tabela?, createdAt }
const ctxMeta = new Map();

// Dedupe do bloco de HEADERS por contexto
const lastHeadersSig = new Map();

/* ────────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

// Normaliza um caminho de FS preservando prefixo UNC (\\servidor\share)
function normalizeFsPath(p) {
  if (!p) return "";
  let s = String(p);
  const isUNC = s.startsWith("\\\\") || s.startsWith("//");
  s = s.replace(/^[\\/]+/, "");      // tira barras do começo
  s = s.replace(/[\\/]+/g, "\\");    // colapsa para "\"
  return (isUNC ? "\\\\" : "") + s;
}

// Extrai o contexto bruto (prioriza string passada; senão, dos dados logger)
function rawContext(contexto, dadosLogger) {
  if (typeof contexto === "string" && contexto) return contexto;
  return dadosLogger?.caminho_original || dadosLogger?.filePath || "__global";
}

// Chave estável para Maps internos: caminho normalizado + lower-case
function ctxKey(contexto, dadosLogger) {
  const base = rawContext(contexto, dadosLogger);
  return normalizeFsPath(base).toLowerCase();
}

// Ex.: \\...\\cadastros\\01_11\\2025\\setembro.csv -> \01_11\2025\setembro.csv
function makeShortTag(filePath, tail = 3) {
  if (!filePath) return "—";
  const norm = String(filePath).replace(/[/\\]+/g, "\\");
  const parts = norm.split("\\").filter(Boolean);
  const take = parts.slice(-tail);
  return "\\" + take.join("\\");
}

const dtfFullBR = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium",
  hour12: false,
  timeZone: "America/Sao_Paulo",
});
const dtfTimeBR = new Intl.DateTimeFormat("pt-BR", {
  timeStyle: "medium",
  hour12: false,
  timeZone: "America/Sao_Paulo",
});
function fmtFullNow() {
  return dtfFullBR.format(new Date());
}
export function fmtTimeNow() {
  return dtfTimeBR.format(new Date());
}

function escRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shrinkMessage(msg, meta) {
  if (!meta?.fullPath || !meta?.shortTag) return msg;
  let out = String(msg);
  const re1 = new RegExp(escRegex(meta.fullPath), "g");
  const re2 = new RegExp(escRegex(JSON.stringify(meta.fullPath)), "g");
  // troca caminho absoluto pelo TAG curto
  out = out
    .replace(re1, meta.shortTag)
    .replace(re2, JSON.stringify(meta.shortTag));
  return out;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* API pública                                                                */
/* ────────────────────────────────────────────────────────────────────────── */
export function registerLogFile(contexto, logPath) {
  const key = ctxKey(contexto);
  logPathsByContext.set(key, logPath);
}
export function getLogFile(contexto) {
  const key = ctxKey(contexto);
  return logPathsByContext.get(key);
}

export async function appendLine(contexto, line) {
  const key = ctxKey(contexto);
  const logFile = logPathsByContext.get(key);
  if (!logFile) return;

  const meta = ctxMeta.get(key);
  const out = meta ? shrinkMessage(line, meta) : line;

  const prev = writeQueues.get(key) || Promise.resolve();
  const next = prev
    .then(() => fs.appendFile(logFile, out, "utf8"))
    .catch(() => {
      /* não propaga erro de IO do log */
    });

  writeQueues.set(key, next);
  try {
    await next;
  } finally {
    if (writeQueues.get(key) === next) writeQueues.delete(key);
  }
}

/**
 * STATUS UPDATE compacto (1 linha) com dedupe por snapshot.
 */
export async function updateLoggerController(dadosLogger, contexto) {
  const key = ctxKey(contexto, dadosLogger);
  const meta = ctxMeta.get(key) || {};

  // Coerção de tipos para snapshot estável (evita "2025" vs 2025)
  const nome =
    (dadosLogger?.nome_arquivo ?? path.parse(meta.fullPath || "").base) || "—";
  const tabela =
    dadosLogger?.tabela ?? dadosLogger?.tabela_destino ?? meta.tabela ?? "—";
  const ano = dadosLogger?.ano != null ? String(dadosLogger.ano) : "—";
  const mes = dadosLogger?.mes != null ? String(dadosLogger.mes) : "—";
  const dia = dadosLogger?.dia != null ? String(dadosLogger.dia) : "—";
  const acao = dadosLogger?.acao != null ? String(dadosLogger.acao) : "—";
  const hash =
    dadosLogger?.hash != null
      ? String(dadosLogger.hash)
      : dadosLogger?.hash_arquivo != null
      ? String(dadosLogger.hash_arquivo)
      : "—";

  // chave de dedupe enxuta
  const snapshot = `nome=${nome}|tabela=${tabela}|data=${ano}-${mes}-${dia}|acao=${acao}|hash=${hash}`;
  if (lastSnapshotHash.get(key) === snapshot) return;
  lastSnapshotHash.set(key, snapshot);

  const now = fmtFullNow();
  const blocoStatus = `---------------- STATUS UPDATE ${now} ----------------
Arquivo: ${nome}
Tabela : ${tabela}
Data   : ${ano}-${mes}-${dia}
Acao   : ${acao}
Hash   : ${hash}
-----------------------------------------------------\n`;

  await appendLine(key, blocoStatus);
}

export async function createLoggerController(filePath, tabela = undefined) {
  // Usa a mesma chave estável para todo o ciclo
  const key = ctxKey(filePath);

  // Se já inicializado neste run, não reescreve o BEGIN
  if (ctxMeta.has(key)) {
    // Atualiza tabela se vier agora e ainda não houver no meta
    const meta = ctxMeta.get(key);
    if (meta && tabela && !meta.tabela) meta.tabela = tabela;
    return;
  }

  const dir = path.dirname(filePath);
  const { base: nome } = path.parse(filePath);
  const logDir = path.join(dir, "loggers");

  if (!ensuredLogDirs.has(logDir)) {
    await fs.mkdir(logDir, { recursive: true });
    ensuredLogDirs.add(logDir);
  }

  const logPath = path.join(logDir, `Logger_${path.parse(filePath).name}.txt`);

  // registra metadados p/ shrink
  const meta = {
    fullPath: filePath,                 // mantém original para shrink
    shortTag: makeShortTag(filePath, 3),
    tabela,
    createdAt: new Date(),
  };
  ctxMeta.set(key, meta);
  registerLogFile(key, logPath);
  lastSnapshotHash.delete(key);
  lastHeadersSig.delete(key);

  // BEGIN no formato "STATUS UPDATE" antigo
  const now = fmtFullNow();
  const blocoBegin = `---------------- BEGIN FILE ${now} ----------------
Arquivo: ${nome || "—"}
Tabela : ${tabela || "—"}
Data   : —-—-—
Acao   : analyze
Hash   : —
-----------------------------------------------------\n`;

  // cria/zera arquivo e escreve o BEGIN
  await fs.writeFile(logPath, blocoBegin, "utf8");
}

export function getLoggerContext(metadados = {}, logData = {}, filePath) {
  // opcionalmente já persistimos a tabela pra aparecer no BEGIN
  const t = logData?.tabela ?? logData?.tabela_destino ?? metadados?.tabela;

  const key = ctxKey(filePath || metadados?.caminho_original || logData?.caminho_original);
  const meta = ctxMeta.get(key);
  if (meta && t && !meta.tabela) meta.tabela = t;

  return {
    ...metadados,
    ...logData,
    caminho_original:
      filePath ??
      metadados?.caminho_original ??
      logData?.caminho_original ??
      "—",
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Relatório de headers (mantido, com dedupe por assinatura do conteúdo)      */
/* ────────────────────────────────────────────────────────────────────────── */

const DEFAULT_IGNORE = ["id", "created_at", "updated_at", "hash_arquivo"];
const DEFAULT_IGNORE_SET = new Set(DEFAULT_IGNORE.map((s) => s.toLowerCase()));

export async function logCsvVsTableHeaders({
  contexto,
  tabela,
  colunasCsv,
  colunasTabela,
  ignore = DEFAULT_IGNORE,
}) {
  const key = ctxKey(contexto);
  const ig =
    ignore === DEFAULT_IGNORE
      ? DEFAULT_IGNORE_SET
      : new Set(ignore.map((s) => (s || "").toLowerCase()));

  const csv = [];
  const tbl = [];
  let widthLeft = 3;
  let widthRight = 6;

  for (let i = 0; i < colunasCsv.length; i++) {
    const c = colunasCsv[i] ?? "";
    const lc = (c + "").toLowerCase();
    if (!ig.has(lc)) {
      csv.push(c);
      if (c.length > widthLeft) widthLeft = c.length;
    }
  }
  for (let i = 0; i < colunasTabela.length; i++) {
    const c = colunasTabela[i] ?? "";
    const lc = (c + "").toLowerCase();
    if (!ig.has(lc)) {
      tbl.push(c);
      if (c.length > widthRight) widthRight = c.length;
    }
  }

  // Dedupe do bloco de HEADERS por assinatura (impede duplicados no mesmo run)
  const headersSig = `${tabela}|csv:${csv.join(",")}||tbl:${tbl.join(",")}`;
  if (lastHeadersSig.get(key) === headersSig) {
    return { extrasNoCsv: [], faltandoNoCsv: [] };
  }
  lastHeadersSig.set(key, headersSig);

  const inTbl = Object.create(null);
  for (let i = 0; i < tbl.length; i++) inTbl[tbl[i]] = 1;

  const extrasNoCsv = [];
  for (let i = 0; i < csv.length; i++)
    if (inTbl[csv[i]] !== 1) extrasNoCsv.push(csv[i]);

  const inCsv = Object.create(null);
  for (let i = 0; i < csv.length; i++) inCsv[csv[i]] = 1;

  const faltandoNoCsv = [];
  for (let i = 0; i < tbl.length; i++)
    if (inCsv[tbl[i]] !== 1) faltandoNoCsv.push(tbl[i]);

  const maxLen = csv.length > tbl.length ? csv.length : tbl.length;
  const dashL = "-".repeat(widthLeft);
  const dashR = "-".repeat(widthRight);

  const header = `---------------- HEADERS CSV × TABELA ----------------
Tabela: ${tabela}
CSV (${csv.length}) | TABELA (${tbl.length})
${dashL}-+-${dashR}
`;

  const rowsArr = new Array(maxLen);
  for (let i = 0; i < maxLen; i++) {
    const l = csv[i] ?? "";
    const r = tbl[i] ?? "";
    rowsArr[i] = `${l.padEnd(widthLeft)} | ${r}`;
  }
  const rows = rowsArr.join("\n") + "\n";

  const diffs = `---------------- DIFERENÇAS ----------------
Extras no CSV   (${extrasNoCsv.length}): ${
    extrasNoCsv.length ? extrasNoCsv.join(", ") : "—"
  }
Faltando no CSV (${faltandoNoCsv.length}): ${
    faltandoNoCsv.length ? faltandoNoCsv.join(", ") : "—"
  }
-----------------------------------------------------\n`;

  await appendLine(key, header + rows + diffs);

  if (extrasNoCsv.length || faltandoNoCsv.length) {
    addAviso(
      `[Headers] Divergências detectadas: extras no CSV (${extrasNoCsv.length}), faltando no CSV (${faltandoNoCsv.length}).`,
      contexto
    );
    if (extrasNoCsv.length)
      addAviso(`[Headers] Extras no CSV: ${extrasNoCsv.join(", ")}`, contexto);
    if (faltandoNoCsv.length)
      addErro(
        `[Headers] Faltando no CSV: ${faltandoNoCsv.join(", ")}`,
        contexto
      );
  } else {
    addInfo("[Headers] CSV e tabela estão alinhados.", contexto);
  }

  return { extrasNoCsv, faltandoNoCsv };
}

export async function finalLoggerController(dadosLogger, contexto) {
  const key = ctxKey(contexto, dadosLogger);

  const now = fmtFullNow();
  await appendLine(key, `==== FINAL ${now} ====\n`);

  logPathsByContext.delete(key);
  lastSnapshotHash.delete(key);
  lastHeadersSig.delete(key);
  writeQueues.delete(key);
  ctxMeta.delete(key);
}
