// src/config/db.js
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

export const schema = process.env.DB_NAME || "diretorio";

export const PIPELINE_FAST_PATH = process.env.PIPELINE_FAST_PATH === "true";
export const INSERT_CONCURRENCY = Number(process.env.INSERT_CONCURRENCY) || 2;
export const FILES_CONCURRENCY = Number(process.env.FILES_CONCURRENCY) || 10;
export const BATCH_QUEUE_HIGH_WATERMARK = Number(process.env.BATCH_QUEUE_HIGH_WATERMARK) || 4;
export const BATCH_QUEUE_LOW_WATERMARK = Number(process.env.BATCH_QUEUE_LOW_WATERMARK) || 2;
export const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 1000;

const connection = await mysql.createPool({
  host: process.env.DB_HOST || "192.168.0.112",
  user: process.env.DB_USER || "lucas",
  password: process.env.DB_PASSWORD || "Lucas_7276",
  database: schema,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export { connection as default };
