import dotenv from "dotenv";
dotenv.config();

export const schema = process.env.DB_NAME;

// FAST_PATH como boolean
export const PIPELINE_FAST_PATH = /^true$/i.test(process.env.PIPELINE_FAST_PATH ?? "");
export const DB_POOL_MAX = Number(process.env.DB_POOL_MAX ?? 10);

// batch e limites de memória
export const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 5000);
 const _bool = v => /^(1|true|yes|on)$/i.test(String(v ?? '').trim());
 export const ADAPTIVE_RAM_GUARD = _bool(process.env.ADAPTIVE_RAM_GUARD ?? 1);
export const RAM_HIGH_MB = Number(process.env.RAM_HIGH_MB ?? 2048);
export const RAM_LOW_MB = Number(process.env.RAM_LOW_MB ?? 1536);
export const RAM_GUARD_INTERVAL_MS = Number(process.env.RAM_GUARD_INTERVAL_MS ?? 1000);

// limites de batch
export const MAX_BATCH_BYTES_DEFAULT = Number(process.env.MAX_BATCH_BYTES ?? 48 * 1024 * 1024);
export const MAX_BATCH_BYTES_WHEN_HIGH = Number(process.env.MAX_BATCH_BYTES_WHEN_HIGH ?? 16 * 1024 * 1024);

// concorrência
const _insertConc = Number(process.env.MAX_CONCURRENT_INSERTS ?? 1);
console.log(_insertConc)
export const MAX_CONCURRENT_INSERTS_DEFAULT = Number.isFinite(_insertConc) && _insertConc > 0 ? _insertConc : 1;


const _filesConc = Number(process.env.FILES_MAX_CONCURRENT ?? 4);
 export const FILES_MAX_CONCURRENT = Math.max(
   1,
   Math.min(
     Number.isFinite(_filesConc) && _filesConc > 0 ? _filesConc : 1,
     Math.floor(DB_POOL_MAX / (MAX_CONCURRENT_INSERTS_DEFAULT || 1)) || 1
   )
     );

// fila
export const HIGH_WATERMARK_DEFAULT = Number(process.env.QUEUE_HIGH_WATERMARK ?? 4);
export const LOW_WATERMARK_DEFAULT = Number(process.env.QUEUE_LOW_WATERMARK ?? 2);

// aliases (retrocompatibilidade)
export const QUEUE_HIGH_WATERMARK = HIGH_WATERMARK_DEFAULT;
export const QUEUE_LOW_WATERMARK = LOW_WATERMARK_DEFAULT;

// staging
export const STAGING_DIR = process.env.STAGING_DIR ?? "./staging";

 export const STAGING_REUSE = _bool(process.env.STAGING_REUSE);
 export const STAGING_VERIFY = _bool(process.env.STAGING_VERIFY ?? 1);
 export const STAGING_CLEANUP_ON_SUCCESS = _bool(process.env.STAGING_CLEANUP_ON_SUCCESS ?? 1);
export const STAGING_CLEANUP_TTL_MIN = Number(process.env.STAGING_CLEANUP_TTL_MIN ?? 60);
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
