// middleware/logger.js
import fs from "fs/promises";
import path from "path";
import { addAviso, addErro, addInfo } from "../middleware/errorHandler.js";



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
  const next = prev
    .then(() => fs.appendFile(logFile, line, "utf8"))
    .catch(() => { /* não propaga erro de IO do log */ });

  writeQueues.set(contexto, next);
  try {
    await next;
  } finally {
    
    if (writeQueues.get(contexto) === next) {
      writeQueues.delete(contexto);
    }
  }
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

  const now = dtfBR.format(new Date());

  const snapshot =
`Arquivo: ${nome}
Tabela : ${tabela}
Data   : ${ano}-${mes}-${dia}
Acao   : ${dadosLogger?.acao ?? "—"}
Hash   : ${dadosLogger?.hash ?? dadosLogger?.hash_arquivo ?? "—"}
-----------------------------------------------------\n`;


  const bloco =
`---------------- STATUS UPDATE ${now} ----------------
${snapshot}`;

  const prev = lastSnapshotHash.get(ctx);
  if (prev === snapshot) return;  

  lastSnapshotHash.set(ctx, snapshot);
  await appendLine(ctx, bloco);
}

export async function finalLoggerController(dadosLogger, contexto) {
  const ctx =
    typeof contexto === "string"
      ? contexto
      : dadosLogger?.caminho_original || dadosLogger?.filePath || "__global";

  const now = dtfBR.format(new Date());
  await appendLine(ctx, `==== FINAL ${now} ====\n`);

  logPathsByContext.delete(ctx);
  lastSnapshotHash.delete(ctx);
  writeQueues.delete(ctx);
}


const ensuredLogDirs = new Set();


const dtfBR = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium",
  hour12: false,
});

export async function createLoggerController(filePath) {
  const dir = path.dirname(filePath);
  const { name } = path.parse(filePath);
  const logDir = path.join(dir, "loggers");

  if (!ensuredLogDirs.has(logDir)) {
    await fs.mkdir(logDir, { recursive: true });
    ensuredLogDirs.add(logDir);
  }

  const logPath = path.join(logDir, `Logger_${name}.txt`);
  const stamp = dtfBR.format(new Date()); 

  // agora é overwrite em vez de append
  await fs.writeFile(logPath, `==== BEGIN ${stamp} ====\n`, "utf8");

  registerLogFile(filePath, logPath);
  lastSnapshotHash.delete(filePath);
}

export function getLoggerContext(metadados = {}, logData = {}, filePath) {
  return {
    ...metadados,
    ...logData,
    caminho_original: filePath ?? metadados?.caminho_original ?? "—",
  };
}



const DEFAULT_IGNORE = ["id", "created_at", "updated_at", "hash_arquivo"];
const DEFAULT_IGNORE_SET = new Set(DEFAULT_IGNORE.map(s => s.toLowerCase()));

/**
 * Sobe no logger a comparação CSV x Tabela e sinaliza diferenças.
 * @param {{
 *   contexto: string,
 *   tabela: string,
 *   colunasCsv: string[],
 *   colunasTabela: string[],
 *   ignore?: string[]
 * }} opts
 */
export async function logCsvVsTableHeaders({
  contexto,
  tabela,
  colunasCsv,
  colunasTabela,
  ignore = DEFAULT_IGNORE,
}) {
  // Set de ignore (reusa o precomputado se for o default)
  const ig = ignore === DEFAULT_IGNORE
    ? DEFAULT_IGNORE_SET
    : new Set(ignore.map(s => (s || "").toLowerCase()));

  // Filtra e já calcula largura (sem arrays temporárias de length)
  const csv = [];
  const tbl = [];
  let widthLeft = 3;  // mínimo "CSV"
  let widthRight = 6; // mínimo "TABELA"

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

  // Membership com mapa plano (mais leve que Set em hot path)
  const inTbl = Object.create(null);
  for (let i = 0; i < tbl.length; i++) inTbl[tbl[i]] = 1;

  const extrasNoCsv = [];
  for (let i = 0; i < csv.length; i++) if (inTbl[csv[i]] !== 1) extrasNoCsv.push(csv[i]);

  const inCsv = Object.create(null);
  for (let i = 0; i < csv.length; i++) inCsv[csv[i]] = 1;

  const faltandoNoCsv = [];
  for (let i = 0; i < tbl.length; i++) if (inCsv[tbl[i]] !== 1) faltandoNoCsv.push(tbl[i]);

  // Bloco formatado lado a lado (CSV | TABELA) — idêntico ao seu
  const maxLen = csv.length > tbl.length ? csv.length : tbl.length;
  const dashL = "-".repeat(widthLeft);
  const dashR = "-".repeat(widthRight);

  const header =
`---------------- HEADERS CSV × TABELA ----------------
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

  const diffs =
`---------------- DIFERENÇAS ----------------
Extras no CSV   (${extrasNoCsv.length}): ${extrasNoCsv.length ? extrasNoCsv.join(", ") : "—"}
Faltando no CSV (${faltandoNoCsv.length}): ${faltandoNoCsv.length ? faltandoNoCsv.join(", ") : "—"}
-----------------------------------------------------\n`;

  await appendLine(contexto, header + rows + diffs);

  // mensagens (mesmo texto)
  if (extrasNoCsv.length || faltandoNoCsv.length) {
    addAviso(
      `[Headers] Divergências detectadas: extras no CSV (${extrasNoCsv.length}), faltando no CSV (${faltandoNoCsv.length}).`,
      contexto
    );
    if (extrasNoCsv.length) addAviso(`[Headers] Extras no CSV: ${extrasNoCsv.join(", ")}`, contexto);
    if (faltandoNoCsv.length) addErro(`[Headers] Faltando no CSV: ${faltandoNoCsv.join(", ")}`, contexto);
  } else {
    addInfo("[Headers] CSV e tabela estão alinhados.", contexto);
  }

  return { extrasNoCsv, faltandoNoCsv };
}
