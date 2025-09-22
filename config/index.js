import dotenv from "dotenv";
dotenv.config();

const numberFromEnv = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const boolFromEnv = (value, fallback = false) =>
  /^(1|true|yes|on)$/i.test(String(value ?? fallback).trim());

export const schema = process.env.DB_NAME;

// FAST_PATH como boolean
export const PIPELINE_FAST_PATH = boolFromEnv(process.env.PIPELINE_FAST_PATH, false);
export const DB_POOL_MAX = numberFromEnv(process.env.DB_POOL_MAX, 10);

// batch e limites de memória
export const BATCH_SIZE = numberFromEnv(process.env.BATCH_SIZE, 5000);
export const ADAPTIVE_RAM_GUARD = boolFromEnv(process.env.ADAPTIVE_RAM_GUARD, 1);
export const RAM_HIGH_MB = numberFromEnv(process.env.RAM_HIGH_MB, 2048);
export const RAM_LOW_MB = numberFromEnv(process.env.RAM_LOW_MB, 1536);
export const RAM_GUARD_INTERVAL_MS = numberFromEnv(process.env.RAM_GUARD_INTERVAL_MS, 1000);

// limites de batch
export const MAX_BATCH_BYTES_DEFAULT = numberFromEnv(
  process.env.MAX_BATCH_BYTES,
  48 * 1024 * 1024
);
export const MAX_BATCH_BYTES_WHEN_HIGH = numberFromEnv(
  process.env.MAX_BATCH_BYTES_WHEN_HIGH,
  16 * 1024 * 1024
);

// concorrência
const _insertConc = numberFromEnv(process.env.MAX_CONCURRENT_INSERTS, 1);
export const MAX_CONCURRENT_INSERTS_DEFAULT = Math.max(1, _insertConc);

const _filesConc = numberFromEnv(process.env.FILES_MAX_CONCURRENT, 4);
export const FILES_MAX_CONCURRENT = Math.max(
  1,
  Math.min(
    _filesConc,
    Math.floor(DB_POOL_MAX / (MAX_CONCURRENT_INSERTS_DEFAULT || 1)) || 1
  )
);

// fila
export const HIGH_WATERMARK_DEFAULT = numberFromEnv(process.env.QUEUE_HIGH_WATERMARK, 4);
export const LOW_WATERMARK_DEFAULT = numberFromEnv(process.env.QUEUE_LOW_WATERMARK, 2);

// aliases (retrocompatibilidade)
export const QUEUE_HIGH_WATERMARK = HIGH_WATERMARK_DEFAULT;
export const QUEUE_LOW_WATERMARK = LOW_WATERMARK_DEFAULT;

// staging
export const STAGING_DIR = process.env.STAGING_DIR ?? "./staging";

export const STAGING_REUSE = boolFromEnv(process.env.STAGING_REUSE, 1);
export const STAGING_VERIFY = boolFromEnv(process.env.STAGING_VERIFY, 1);
export const STAGING_CLEANUP_ON_SUCCESS = boolFromEnv(
  process.env.STAGING_CLEANUP_ON_SUCCESS,
  1
);
export const STAGING_CLEANUP_TTL_MIN = numberFromEnv(
  process.env.STAGING_CLEANUP_TTL_MIN,
  60
);
// no final do index.js

function printConfig() {
  const config = {
    schema,
    pipeline: {
      PIPELINE_FAST_PATH,
    },
    pool: {
      DB_POOL_MAX,
    },
    batch: {
      BATCH_SIZE,
      MAX_BATCH_BYTES_DEFAULT,
      MAX_BATCH_BYTES_WHEN_HIGH,
    },
    ram: {
      ADAPTIVE_RAM_GUARD,
      RAM_HIGH_MB,
      RAM_LOW_MB,
      RAM_GUARD_INTERVAL_MS,
    },
    concorrencia: {
      MAX_CONCURRENT_INSERTS_DEFAULT,
      FILES_MAX_CONCURRENT,
    },
    fila: {
      HIGH_WATERMARK_DEFAULT,
      LOW_WATERMARK_DEFAULT,
    },
    staging: {
      STAGING_DIR,
      STAGING_REUSE,
      STAGING_VERIFY,
      STAGING_CLEANUP_ON_SUCCESS,
      STAGING_CLEANUP_TTL_MIN,
    },
  };

  console.log("===== CONFIGURAÇÃO CARREGADA =====");
  console.log(JSON.stringify(config, null, 2));
  console.log("==================================");
}

printConfig();
