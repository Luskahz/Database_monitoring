import mysql from 'mysql2/promise';

const POOL_MAX = parseInt(process.env.DB_POOL_MAX, 10);
const POOL_MIN = parseInt(process.env.DB_POOL_MIN, 10);
const IDLE_MS  = parseInt(process.env.DB_POOL_IDLE_MS, 10);
export const DB_QUERY_TIMEOUT_MS = parseInt(process.env.DB_QUERY_TIMEOUT_MS, 10) || 120000;

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
  connectTimeout: 15000,
  acquireTimeout: 30000,
  keepAliveInitialDelay: 0,
  //multipleStatements: true,
});

pool.on('connection', conn => {
  conn.query('SET SESSION wait_timeout = 1800').catch(() => {});
});

export async function getPool() { return pool; }

export async function queryWithTimeout(sql, params, ms = DB_QUERY_TIMEOUT_MS) {
  const [rows] = await pool.query({ sql, timeout: ms }, params);
  return rows;
}

export async function query(sql, params) {
  return queryWithTimeout(sql, params);
}

export async function execute(sql, params) {
  const [rows] = await pool.execute({ sql, timeout: DB_QUERY_TIMEOUT_MS }, params);
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
