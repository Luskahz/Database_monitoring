import dotenv from 'dotenv';
dotenv.config();

export const schema = process.env.DB_NAME || 'diretorio';

export const PIPELINE_FAST_PATH = process.env.PIPELINE_FAST_PATH === 'true';
export const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 1000;

export const ADAPTIVE_RAM_GUARD = process.env.ADAPTIVE_RAM_GUARD === '1';
export const RAM_HIGH_MB = Number(process.env.RAM_HIGH_MB || 2048);
export const RAM_LOW_MB = Number(process.env.RAM_LOW_MB || 1536);
export const MAX_BATCH_BYTES_DEFAULT = Number(process.env.MAX_BATCH_BYTES || 48 * 1024 * 1024);
export const MAX_BATCH_BYTES_WHEN_HIGH = Number(process.env.MAX_BATCH_BYTES_WHEN_HIGH || 16 * 1024 * 1024);
export const MAX_CONCURRENT_INSERTS_DEFAULT = Number(process.env.MAX_CONCURRENT_INSERTS || 1);
export const HIGH_WATERMARK_DEFAULT = Number(process.env.QUEUE_HIGH_WATERMARK || 2);
export const LOW_WATERMARK_DEFAULT = Number(process.env.QUEUE_LOW_WATERMARK || 1);
export const RAM_GUARD_INTERVAL_MS = Number(process.env.RAM_GUARD_INTERVAL_MS || 1000);

// aliases for backwards compatibility
export const QUEUE_HIGH_WATERMARK = HIGH_WATERMARK_DEFAULT;
export const QUEUE_LOW_WATERMARK = LOW_WATERMARK_DEFAULT;
