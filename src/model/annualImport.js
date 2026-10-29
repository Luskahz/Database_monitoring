import { randomUUID } from "node:crypto";
import { getPool, query, DB_QUERY_TIMEOUT_MS } from "../../config/dbPool.js";
import { schema, BATCH_SIZE, MAX_BATCH_BYTES_DEFAULT } from "../../config/index.js";
import mapearTipo from "../utils/mapearTipos.js";
import normalizar from "../utils/normalizar.js";
import sanitizeRow from "../utils/sanitizeValue.js";
import { annualRange, annualDestination } from "../utils/annualLayout.js";
import { readAnnualCsv } from "../utils/readAnnualCsv.js";
import { normalizeHeadersOnce } from "../utils/csvStream.js";
import { insertLog } from "./logModel.js";
import { addInfo, addAviso } from "../middleware/errorHandler.js";
import { updateActiveJob } from "../utils/queueTracker.js";

const ident = (value) => `\`${String(value).replace(/`/g, "``")}\``;
const qualified = (table) => `${ident(schema)}.${ident(table)}`;
const isGenerated = (column) => /(?:VIRTUAL|STORED) GENERATED/i.test(column.EXTRA || "");

export async function loadAnnualTableDefinition(table, run = query) {
  const tables = await run(`SELECT TABLE_NAME, ENGINE FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?, 'log_ingestao')`, [schema, table]);
  for (const name of [table, "log_ingestao"]) {
    if (!tables.some((r) => r.TABLE_NAME === name && String(r.ENGINE).toLowerCase() === "innodb")) {
      throw new Error(`[Anual] '${name}' precisa existir e usar InnoDB para permitir rollback.`);
    }
  }
  const columns = await run(`SELECT COLUMN_NAME, DATA_TYPE, EXTRA, NUMERIC_SCALE
    FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
    ORDER BY ORDINAL_POSITION`, [schema, table]);
  const dates = columns.filter((c) => c.DATA_TYPE === "date");
  if (dates.length !== 1) {
    throw new Error(`[Anual] '${table}' deve ter exatamente uma coluna DATE; encontradas ${dates.length}.`);
  }
  const triggers = await run(`SELECT TRIGGER_NAME FROM INFORMATION_SCHEMA.TRIGGERS
    WHERE EVENT_OBJECT_SCHEMA = ? AND EVENT_OBJECT_TABLE IN (?, 'log_ingestao')`, [schema, table]);
  if (triggers.length) throw new Error("[Anual] Tabela com trigger exige avaliação específica antes da carga anual.");
  const cascading = await run(`SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
    WHERE UNIQUE_CONSTRAINT_SCHEMA = ? AND REFERENCED_TABLE_NAME = ?
      AND DELETE_RULE IN ('CASCADE', 'SET NULL')`, [schema, table]);
  if (cascading.length) throw new Error("[Anual] Exclusão com efeito em tabelas dependentes bloqueada (FK CASCADE/SET NULL).");

  const insertable = columns.filter((c) => !isGenerated(c));
  const types = Object.fromEntries(insertable.map((c) => {
    let type = mapearTipo(c.DATA_TYPE);
    if (c.DATA_TYPE === "decimal" || c.DATA_TYPE === "numeric") {
      const scale = Number(c.NUMERIC_SCALE);
      type = { type: "decimal", profile: scale <= 2 ? "money" : "quantity",
        thousands: scale <= 2 ? "allow" : "never", maxFracDigits: scale };
    }
    return [c.COLUMN_NAME, type];
  }));
  return { dateCol: dates[0].COLUMN_NAME, generatedDate: isGenerated(dates[0]),
    columns: insertable.map((c) => c.COLUMN_NAME), allColumns: columns, types };
}

function validateAnnualIdentity(meta) {
  const range = annualRange(meta);
  const source = meta.caminho_original || meta.caminho;
  const destination = source && annualDestination(source);
  if (!range || !destination || destination.periodicidade !== "anual" ||
      destination.tabela_destino !== (meta.tabela || meta.tabela_destino) ||
      destination.ano !== String(meta.ano) || destination.nome_arquivo !== meta.nome_arquivo) {
    throw new Error("[Anual] Caminho, tabela, nome e período anual inconsistentes. Operação bloqueada.");
  }
  return range;
}

async function annualConnection(fn) {
  const connection = await getPool().getConnection();
  let originalMode;
  let transaction = false;
  let reusable = true;
  const run = async (sql, values = []) => {
    const [result] = await connection.query({ sql, timeout: DB_QUERY_TIMEOUT_MS }, values);
    if (result?.warningStatus > 0) throw new Error("[Anual] Banco retornou avisos de conversão; carga cancelada.");
    return result;
  };
  try {
    const [session] = await run("SELECT @@SESSION.sql_mode AS mode");
    originalMode = session.mode;
    const modes = new Set(String(originalMode || "").split(",").filter(Boolean));
    for (const mode of ["STRICT_ALL_TABLES", "NO_ZERO_DATE", "NO_ZERO_IN_DATE"]) modes.add(mode);
    await run("SET SESSION sql_mode = ?", [[...modes].join(",")]);
    await connection.beginTransaction();
    transaction = true;
    const result = await fn({ run, connection });
    await connection.commit();
    transaction = false;
    return result;
  } catch (error) {
    if (error.discardAnnualConnection) reusable = false;
    if (transaction) {
      try { await connection.rollback(); }
      catch { reusable = false; }
    }
    throw error;
  } finally {
    if (originalMode != null && reusable) {
      try { await run("SET SESSION sql_mode = ?", [originalMode]); }
      catch { reusable = false; }
    }
    if (reusable) connection.release();
    else connection.destroy();
  }
}

export async function importAnnualFile(meta, logData) {
  const [start, end] = validateAnnualIdentity(meta);
  const context = meta.caminho_original;
  const result = await annualConnection(async ({ run, connection }) => {
    // Mantém metadata lock durante a preparação: DDL não pode mudar a tabela no meio.
    await run(`SELECT * FROM ${qualified(meta.tabela)} LIMIT 0`);
    await run(`SELECT * FROM ${qualified("log_ingestao")} LIMIT 0`);
    const definition = await loadAnnualTableDefinition(meta.tabela, run);
    const temp = ident(`annual_${randomUUID().replaceAll("-", "")}`);
    let created = false;
    try {
      await run(`CREATE TEMPORARY TABLE ${temp} LIKE ${qualified(meta.tabela)}`);
      created = true;
      let headers;
      let insertColumns;
      let count = 0;
      let batch = [];
      let batchBytes = 0;
      const rowCap = Math.max(1, Math.min(BATCH_SIZE, 1000));
      const bytesCap = Math.max(1024, Math.min(MAX_BATCH_BYTES_DEFAULT, 4 * 1024 * 1024));
      const flush = async () => {
        if (!batch.length) return;
        const values = batch.flat();
        const placeholder = `(${insertColumns.map(() => "?").join(",")})`;
        await run(`INSERT INTO ${temp} (${insertColumns.map(ident).join(",")}) VALUES ${batch.map(() => placeholder).join(",")}`, values);
        batch = [];
        batchBytes = 0;
        updateActiveJob(context, { stage: "validando-anual", detail: `${count} registros preparados; destino preservado` });
      };
      meta.hash = await readAnnualCsv(meta.paths?.work || context, {
        encoding: meta.encoding, delimiter: meta.delimiter,
        async onRows(rows) {
          for (const row of rows) {
            if (!headers) {
              // Mesma normalização e projeção por nome usadas no fluxo legado:
              // vazios/repetidos recebem nomes, extras não são inseridos e ausentes ficam NULL.
              headers = normalizeHeadersOnce(row).headers;
              const byHeader = new Map(definition.allColumns.map((c) => [normalizar(c.COLUMN_NAME), c]));
              insertColumns = definition.columns;
              if (!insertColumns.length) throw new Error("[Anual] CSV sem colunas graváveis.");
              headers = headers.map((h) => byHeader.get(h)?.COLUMN_NAME ?? h);
              continue;
            }
            const raw = Object.fromEntries(headers.map((h, i) => [h, row[i]?.trim() ?? ""]));
            const typed = sanitizeRow(raw, definition.types, context);
            for (const col of insertColumns) {
              if (raw[col] != null && raw[col] !== "" && typed[col] == null) {
                throw new Error(`[Anual] Valor inválido na coluna '${col}', registro ${count + 1}.`);
              }
            }
            if (!definition.generatedDate) {
              const day = typed[definition.dateCol];
              if (!day || day < start || day >= end) {
                throw new Error(`[Anual] Data vazia, inválida ou fora de ${meta.ano} no registro ${count + 1}.`);
              }
            }
            const values = insertColumns.map((c) => typed[c] ?? null);
            const bytes = Buffer.byteLength(JSON.stringify(values), "utf8");
            if (batch.length && (batch.length >= rowCap || batchBytes + bytes > bytesCap)) await flush();
            batch.push(values);
            batchBytes += bytes;
            count++;
          }
        },
      });
      await flush();
      if (!count) throw new Error("[Anual] CSV vazio ou somente com cabeçalho: substituição bloqueada.");
      const invalid = await run(`SELECT 1 FROM ${temp} WHERE ${ident(definition.dateCol)} IS NULL
        OR ${ident(definition.dateCol)} < ? OR ${ident(definition.dateCol)} >= ? LIMIT 1`, [start, end]);
      if (invalid.length) throw new Error(`[Anual] Datas calculadas inválidas ou fora de ${meta.ano}.`);
      meta.total_linhas = count;
      meta.coluna_data = definition.dateCol;
      const cols = insertColumns.map(ident).join(",");
      updateActiveJob(context, { stage: "substituindo-anual", detail: `Substituindo somente ${meta.ano} em transação` });
      await run(`DELETE FROM ${qualified(meta.tabela)} WHERE ${ident(definition.dateCol)} >= ? AND ${ident(definition.dateCol)} < ?`, [start, end]);
      // Sem UPSERT/fallback: conflito com uma chave de outro ano aborta tudo.
      await run(`INSERT INTO ${qualified(meta.tabela)} (${cols}) SELECT ${cols} FROM ${temp}`);
      // Preserva histórico, mas impede que hashes de meses/anos substituídos
      // façam o legado ignorar uma reapresentação legítima do mesmo CSV.
      await run(`UPDATE ${qualified("log_ingestao")} SET sucesso = 0, mensagem_erro = ?
        WHERE tabela_destino = ? AND ano = ? AND sucesso = 1`,
      ["Período substituído por carga anual.", meta.tabela, Number(meta.ano)]);
      Object.assign(logData, { hash_arquivo: meta.hash, total_linhas: count,
        coluna_data: definition.dateCol, sucesso: true, mensagem_erro: null });
      await insertLog(logData, { connection });
      return { erro: false, total: count, inseridos: count, falhas: 0, mensagem: null };
    } finally {
      if (created) {
        // A conexão é descartada se a limpeza falhar; não retorna temp tables ao pool.
        try { await run(`DROP TEMPORARY TABLE ${temp}`); }
        catch (error) { error.discardAnnualConnection = true; throw error; }
      }
    }
  });
  logData.committedWithData = true;
  updateActiveJob(context, { stage: "finalização", progress: 1, detail: `${result.inseridos} registros anuais confirmados` });
  addInfo(`[Anual] ${meta.tabela}/${meta.nome_arquivo}: ano substituído e log confirmados na mesma transação (${result.inseridos} registros).`, context);
  return result;
}

export async function deleteAnnualFile(logData) {
  const [start, end] = validateAnnualIdentity(logData);
  if (!logData.id || !logData.sucesso || !logData.hash_arquivo) {
    throw new Error("[Anual] Exclusão exige log de ingestão bem-sucedida.");
  }
  return annualConnection(async ({ run }) => {
    const table = logData.tabela_destino;
    await run(`SELECT * FROM ${qualified(table)} LIMIT 0`);
    await run(`SELECT * FROM ${qualified("log_ingestao")} LIMIT 0`);
    const definition = await loadAnnualTableDefinition(table, run);
    if (definition.dateCol !== logData.coluna_data) throw new Error("[Anual] Coluna DATE mudou desde a ingestão; exclusão bloqueada.");
    const rows = await run(`SELECT id, sucesso FROM ${qualified("log_ingestao")} WHERE id = ? FOR UPDATE`, [logData.id]);
    if (!rows.length || !rows[0].sucesso) throw new Error("[Anual] Log não está mais disponível para exclusão.");
    const result = await run(`DELETE FROM ${qualified(table)} WHERE ${ident(definition.dateCol)} >= ? AND ${ident(definition.dateCol)} < ?`, [start, end]);
    await run(`UPDATE ${qualified("log_ingestao")} SET sucesso = 0, mensagem_erro = ?
      WHERE tabela_destino = ? AND ano = ? AND sucesso = 1`,
    ["Período removido após exclusão do arquivo anual.", table, Number(logData.ano)]);
    await run(`DELETE FROM ${qualified("log_ingestao")} WHERE id = ?`, [logData.id]);
    addAviso(`[Anual] Exclusão do arquivo: removendo somente ${table}/${logData.ano} (${result.affectedRows} registros).`, logData.caminho);
    return { erro: false, removidos: result.affectedRows };
  });
}
