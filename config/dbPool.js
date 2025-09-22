// config/dbPool.js
import mysql from "mysql2/promise";

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const POOL_MAX = toNumber(process.env.DB_POOL_MAX, 10);
const POOL_MIN = toNumber(process.env.DB_POOL_MIN, 2);
const IDLE_MS = toNumber(process.env.DB_POOL_IDLE_MS, 60000);
const DB_PORT = toNumber(process.env.DB_PORT, 3306);
const _t = Number(process.env.DB_QUERY_TIMEOUT_MS);
export const DB_QUERY_TIMEOUT_MS = Number.isFinite(_t) ? _t : 120000;

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: DB_PORT,
  waitForConnections: true,
  connectionLimit: POOL_MAX,
  maxIdle: POOL_MIN,
  idleTimeout: IDLE_MS,
  queueLimit: 0,
  enableKeepAlive: true,
  connectTimeout: 15000,
  keepAliveInitialDelay: 0,
});

pool.on("connection", (conn) => {
  if (typeof conn.promise === "function") {
    conn.promise().query("SET SESSION wait_timeout = 1800").catch(() => {});
  } else {
    conn.query("SET SESSION wait_timeout = 1800", () => {});
  }
});

export function getPool() {
  return pool;
}

export async function query(sql, params) {
  const [rows] = await pool.query({ sql, timeout: DB_QUERY_TIMEOUT_MS }, params);
  return rows;
}

export async function execute(sql, params) {
  const [rows] = await pool.execute({ sql, timeout: DB_QUERY_TIMEOUT_MS }, params);
  return rows;
}

export async function withConnection(fn) {
  const conn = await pool.getConnection();
  try {
    return await fn(conn);
  } finally {
    conn.release();
  }
}

export async function shutdownPool() {
  try {
    await pool.end();
  } catch {}
}
