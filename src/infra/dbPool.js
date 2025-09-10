import mysql from 'mysql2/promise';

const POOL_MAX = parseInt(process.env.DB_POOL_MAX ?? '10', 10);
const POOL_MIN = parseInt(process.env.DB_POOL_MIN ?? '2', 10);
const IDLE_MS  = parseInt(process.env.DB_POOL_IDLE_MS ?? '60000', 10);
export const DB_QUERY_TIMEOUT_MS = parseInt(process.env.DB_QUERY_TIMEOUT_MS ?? '0', 10);

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: POOL_MAX,
  maxIdle: POOL_MIN,
  idleTimeout: IDLE_MS,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  // optional: multipleStatements: true,
});

export async function getPool() { return pool; }

function withTimeout(sql) {
  return DB_QUERY_TIMEOUT_MS > 0 ? { sql, timeout: DB_QUERY_TIMEOUT_MS } : sql;
}

export async function query(sql, params) {
  const [rows] = await pool.query(withTimeout(sql), params);
  return rows;
}

export async function execute(sql, params) {
  const [rows] = await pool.execute(withTimeout(sql), params);
  return rows;
}

export async function withConnection(fn) {
  const conn = await pool.getConnection();
  try { return await fn(conn); }
  finally { conn.release(); }
}

export async function shutdownPool() {
  try { await pool.end(); } catch {}
}
