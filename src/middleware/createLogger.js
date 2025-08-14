//createLogger.js
export async function createLoggerController(filePath) {
  const dir = path.dirname(filePath);
  const { name } = path.parse(filePath);
  const logPath = await getLoggerFileName(dir, name);

  try {
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.writeFile(logPath, "Processo iniciado...\n", "utf8");

    // registra para que o errorHandler saiba onde escrever
    registerLogFile(filePath, logPath);
  } catch (e) {
    console.log("[Logger] erro ao iniciar o arquivo de log");
  }
}


// utils/headerDiffLogger.js
import { appendLine } from "../middleware/logger.js";
import { addAviso, addErro, addInfo } from "../middleware/errorHandler.js";

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
  ignore = ["id", "created_at", "updated_at", "hash_arquivo"], // ajuste à sua realidade
}) {
  // prepara conjuntos ignorando colunas de sistema
  const ig = new Set(ignore.map((s) => s.toLowerCase()));
  const csv = colunasCsv.filter((c) => !ig.has((c || "").toLowerCase()));
  const tbl = colunasTabela.filter((c) => !ig.has((c || "").toLowerCase()));

  const setCsv = new Set(csv);
  const setTbl = new Set(tbl);

  const extrasNoCsv = csv.filter((c) => !setTbl.has(c));
  const faltandoNoCsv = tbl.filter((c) => !setCsv.has(c));

  // bloco formatado lado a lado (CSV | TABELA)
  const widthLeft = Math.max(3, Math.max(...csv.map((s) => s.length), 0));
  const widthRight = Math.max(6, Math.max(...tbl.map((s) => s.length), 0));
  const maxLen = Math.max(csv.length, tbl.length);

  const header =
`---------------- HEADERS CSV × TABELA ----------------
Tabela: ${tabela}
CSV (${csv.length}) | TABELA (${tbl.length})
${"-".repeat(widthLeft)}-+-${"-".repeat(widthRight)}
`;

  let rows = "";
  for (let i = 0; i < maxLen; i++) {
    const l = csv[i] ?? "";
    const r = tbl[i] ?? "";
    rows += `${l.padEnd(widthLeft)} | ${r}\n`;
  }

  const diffs =
`---------------- DIFERENÇAS ----------------
Extras no CSV   (${extrasNoCsv.length}): ${extrasNoCsv.length ? extrasNoCsv.join(", ") : "—"}
Faltando no CSV (${faltandoNoCsv.length}): ${faltandoNoCsv.length ? faltandoNoCsv.join(", ") : "—"}
-----------------------------------------------------\n`;

  await appendLine(contexto, header + rows + diffs);

  // mensagens resumidas também entram no fluxo padrão:
  if (extrasNoCsv.length || faltandoNoCsv.length) {
    addAviso(
      `[Headers] Divergências detectadas: extras no CSV (${extrasNoCsv.length}), faltando no CSV (${faltandoNoCsv.length}).`,
      contexto
    );
    if (extrasNoCsv.length) {
      addAviso(`[Headers] Extras no CSV: ${extrasNoCsv.join(", ")}`, contexto);
    }
    if (faltandoNoCsv.length) {
      addErro(`[Headers] Faltando no CSV: ${faltandoNoCsv.join(", ")}`, contexto);
    }
  } else {
    addInfo("[Headers] CSV e tabela estão alinhados.", contexto);
  }

  return { extrasNoCsv, faltandoNoCsv };
}
