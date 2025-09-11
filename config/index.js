import dotenv from 'dotenv';
dotenv.config();

export const schema = process.env.DB_NAME;

export const PIPELINE_FAST_PATH = process.env.PIPELINE_FAST_PATH;
export const BATCH_SIZE = Number(process.env.BATCH_SIZE);

export const ADAPTIVE_RAM_GUARD = process.env.ADAPTIVE_RAM_GUARD;
export const RAM_HIGH_MB = Number(process.env.RAM_HIGH_MB);
export const RAM_LOW_MB = Number(process.env.RAM_LOW_MB);
export const MAX_BATCH_BYTES_DEFAULT = Number(process.env.MAX_BATCH_BYTES);
export const MAX_BATCH_BYTES_WHEN_HIGH = Number(process.env.MAX_BATCH_BYTES_WHEN_HIGH);
export const MAX_CONCURRENT_INSERTS_DEFAULT = Number(process.env.MAX_CONCURRENT_INSERTS);
export const HIGH_WATERMARK_DEFAULT = Number(process.env.QUEUE_HIGH_WATERMARK);
export const LOW_WATERMARK_DEFAULT = Number(process.env.QUEUE_LOW_WATERMARK);
export const RAM_GUARD_INTERVAL_MS = Number(process.env.RAM_GUARD_INTERVAL_MS);

// aliases for backwards compatibility
export const QUEUE_HIGH_WATERMARK = HIGH_WATERMARK_DEFAULT;
export const QUEUE_LOW_WATERMARK = LOW_WATERMARK_DEFAULT;
