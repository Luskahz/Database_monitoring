import mysql from "mysql2/promise";
import { INSERT_CONCURRENCY, FILES_CONCURRENCY } from "../config/index.js";

export const schema = process.env.DB_NAME || process.env.DB_SCHEMA;

const connectionLimit = Math.max(INSERT_CONCURRENCY * 2, FILES_CONCURRENCY + 2);

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: schema,
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit,
});

export async function query(sql, params) {
  const conn = await pool.getConnection();
  try {
    return await conn.query(sql, params);
  } finally {
    conn.release();
  }
}

export async function execute(sql, params) {
  const conn = await pool.getConnection();
  try {
    return await conn.execute(sql, params);
  } finally {
    conn.release();
  }
}

export default { query, execute };
