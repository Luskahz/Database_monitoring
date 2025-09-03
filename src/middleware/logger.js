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
// ctx -> { fullPath, shortTag, tabela?, createdAt }
const ctxMeta = new Map();

/* ────────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

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
  logPathsByContext.set(contexto, logPath);
}
export function getLogFile(contexto) {
  return logPathsByContext.get(contexto);
}

export async function appendLine(contexto, line) {
  const logFile = getLogFile(contexto);
  if (!logFile) return;

  const meta = ctxMeta.get(contexto);
  const out = meta ? shrinkMessage(line, meta) : line;

  const prev = writeQueues.get(contexto) || Promise.resolve();
  const next = prev
    .then(() => fs.appendFile(logFile, out, "utf8"))
    .catch(() => {
      /* não propaga erro de IO do log */
    });

  writeQueues.set(contexto, next);
  try {
    await next;
  } finally {
    if (writeQueues.get(contexto) === next) writeQueues.delete(contexto);
  }
}

/**
 * STATUS UPDATE compacto (1 linha) com dedupe por snapshot.
 */
export async function updateLoggerController(dadosLogger, contexto) {
  const ctx =
    typeof contexto === "string"
      ? contexto
      : dadosLogger?.caminho_original || dadosLogger?.filePath || "__global";

  const meta = ctxMeta.get(ctx) || {};
  const nome =
    (dadosLogger?.nome_arquivo ?? path.parse(meta.fullPath || "").base) || "—";
  const tabela =
    dadosLogger?.tabela ?? dadosLogger?.tabela_destino ?? meta.tabela ?? "—";
  const ano = dadosLogger?.ano ?? "—";
  const mes = dadosLogger?.mes ?? "—";
  const dia = dadosLogger?.dia ?? "—";
  const acao = dadosLogger?.acao ?? "—";
  const hash = dadosLogger?.hash ?? dadosLogger?.hash_arquivo ?? "—";

  // chave de dedupe enxuta
  const snapshot = `nome=${nome}|tabela=${tabela}|data=${ano}-${mes}-${dia}|acao=${acao}|hash=${hash}`;
  if (lastSnapshotHash.get(ctx) === snapshot) return;
  lastSnapshotHash.set(ctx, snapshot);

  const now = fmtFullNow();
  const blocoStatus = `---------------- STATUS UPDATE ${now} ----------------
Arquivo: ${nome}
Tabela : ${tabela}
Data   : ${ano}-${mes}-${dia}
Acao   : ${acao}
Hash   : ${hash}
-----------------------------------------------------\n`;

  await appendLine(ctx, blocoStatus);
}

export async function createLoggerController(filePath, tabela = undefined) {
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
    fullPath: filePath,
    shortTag: makeShortTag(filePath, 3), // \03_05_30_cliente\2025\agosto.csv
    tabela,
    createdAt: new Date(),
  };
  ctxMeta.set(filePath, meta);
  registerLogFile(filePath, logPath);
  lastSnapshotHash.delete(filePath);

  // BEGIN no formato "STATUS UPDATE" antigo
  const now = fmtFullNow();
  const blocoBegin = `---------------- BEGIN FILE ${now} ----------------
Arquivo: ${nome || "—"}
Tabela : ${tabela || "—"}
Data   : —-—-—
Acao   : analyze
Hash   : —
-----------------------------------------------------\n`;

  await fs.writeFile(logPath, blocoBegin, "utf8");
}

export function getLoggerContext(metadados = {}, logData = {}, filePath) {
  // opcionalmente já persistimos a tabela pra aparecer no BEGIN
  const t = logData?.tabela ?? logData?.tabela_destino ?? metadados?.tabela;
  const meta = ctxMeta.get(filePath);
  if (meta && t && !meta.tabela) meta.tabela = t;

  return {
    ...metadados,
    ...logData,
    caminho_original: filePath ?? metadados?.caminho_original ?? "—",
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Relatório de headers (mantido, mas sem verborragia nos prefixos)           */
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

  await appendLine(contexto, header + rows + diffs);

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
  const ctx = typeof contexto === "string"
    ? contexto
    : dadosLogger?.caminho_original || dadosLogger?.filePath || "__global";

  const now = fmtFullNow();
  await appendLine(ctx, `==== FINAL ${now} ====\n`);

  logPathsByContext.delete(ctx);
  lastSnapshotHash.delete(ctx);
  writeQueues.delete(ctx);
  ctxMeta.delete(ctx);
}
