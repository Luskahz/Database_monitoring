export function normalizeTotal(total) {
  const n = Number(total);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default normalizeTotal;
