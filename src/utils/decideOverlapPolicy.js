import { existsAnyDataInRange, normalizeRangeInput } from "../model/overlapQueries.js";

function emit(logger, payload) {
  try {
    logger?.info?.("[OverlapDecision]", payload);
  } catch (err) {
    // logger falhou — segue sem interromper o fluxo
  }
}

export async function decideOverlapPolicy({ table, dateCol, range, db, logger } = {}) {
  const checkedAt = new Date().toISOString();
  const basePayload = {
    table: table ?? null,
    dateCol: dateCol ?? null,
    checkedAt,
  };

  if (!table) {
    const decision = {
      hasOverlap: false,
      strategy: "replace",
      reason: "table-missing",
      checkedAt,
    };
    emit(logger, { ...basePayload, range: range ?? null, ...decision });
    return decision;
  }

  if (!dateCol) {
    const decision = {
      hasOverlap: false,
      strategy: "replace",
      reason: "date-column-missing",
      checkedAt,
    };
    emit(logger, { ...basePayload, range: range ?? null, ...decision });
    return decision;
  }

  const normalizedRange = normalizeRangeInput(range);
  if (!normalizedRange) {
    const decision = {
      hasOverlap: false,
      strategy: "replace",
      reason: "range-missing",
      checkedAt,
    };
    emit(logger, { ...basePayload, range: range ?? null, ...decision });
    return decision;
  }

  try {
    const hasOverlap = await existsAnyDataInRange({
      table,
      dateCol,
      range: normalizedRange,
      db,
    });
    const strategy = hasOverlap ? "replace" : "insert";
    const decision = {
      hasOverlap: Boolean(hasOverlap),
      strategy,
      reason: hasOverlap ? "overlap-found" : "no-overlap",
      checkedAt,
    };
    emit(logger, { ...basePayload, range: normalizedRange, ...decision });
    return decision;
  } catch (err) {
    const decision = {
      hasOverlap: false,
      strategy: "replace",
      reason: "query-error",
      checkedAt,
    };
    emit(logger, {
      ...basePayload,
      range: normalizedRange,
      error: err?.message,
      ...decision,
    });
    throw err;
  }
}
