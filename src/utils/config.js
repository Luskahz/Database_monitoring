export const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 10000;
export const MAX_CONCURRENT_INSERTS = Number(process.env.MAX_CONCURRENT_INSERTS) || 1;
export const QUEUE_HIGH_WATERMARK = Number(process.env.QUEUE_HIGH_WATERMARK) || 2;
export const QUEUE_LOW_WATERMARK = Number(process.env.QUEUE_LOW_WATERMARK) || 1;

// Enable single-pass CSV ingestion when true (default: true)
export const PIPELINE_FAST_PATH = process.env.PIPELINE_FAST_PATH !== "false";
