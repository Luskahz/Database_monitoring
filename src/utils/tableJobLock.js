// Cargas anuais e mensais/diárias da mesma tabela não podem intercalar DELETE/INSERT.
const tails = new Map();
export async function withTableJobLock(table, fn) {
  const key = String(table).toLowerCase();
  const previous = tails.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  tails.set(key, current);
  await previous;
  try { return await fn(); }
  finally {
    release();
    if (tails.get(key) === current) tails.delete(key);
  }
}
