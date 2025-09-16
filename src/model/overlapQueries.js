import { query } from "../../config/dbPool.js";
import { schema } from "../../config/index.js";

function toDate(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getTime());
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }
  return null;
}

function toIsoDay(date) {
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeRange(range) {
  if (!range) return null;
  const startInput = range.start ?? range.begin ?? range.inicio;
  const startDate = toDate(startInput);
  if (!startDate) return null;

  let endExclusiveDate = null;
  if (range.endExclusive != null) {
    endExclusiveDate = toDate(range.endExclusive);
  }
  if (!endExclusiveDate) {
    const endInput = range.end ?? range.finish ?? range.stop ?? range.final;
    const endDate = toDate(endInput);
    if (!endDate) return null;
    endExclusiveDate = new Date(endDate.getTime());
    endExclusiveDate.setUTCDate(endExclusiveDate.getUTCDate() + 1);
  }

  const startIso = toIsoDay(startDate);
  const endExclusiveIso = toIsoDay(endExclusiveDate);
  if (!startIso || !endExclusiveIso) return null;
  if (endExclusiveIso <= startIso) return null;

  return { start: startIso, endExclusive: endExclusiveIso };
}

async function runQuery(executor, sql, params) {
  const result = await executor(sql, params);
  if (Array.isArray(result)) {
    if (Array.isArray(result[0])) return result[0];
    return result;
  }
  return result;
}

export async function existsAnyDataInRange({ table, dateCol, range, db }) {
  if (!table || !dateCol) return null;
  const normalizedRange = normalizeRange(range);
  if (!normalizedRange) return null;

  let executor = query;
  if (db && typeof db.query === "function") {
    executor = db.query.bind(db);
  }

  const sql = `
      SELECT 1
      FROM \`${schema}\`.\`${table}\`
      WHERE \`${dateCol}\` >= ? AND \`${dateCol}\` < ?
      LIMIT 1
    `;
  try {
    const rows = await runQuery(executor, sql, [normalizedRange.start, normalizedRange.endExclusive]);
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) {
    throw new Error(`[overlap exists range] Erro ao consultar range de datas: ${e.message}`);
  }
}

export function normalizeRangeInput(range) {
  return normalizeRange(range);
}
