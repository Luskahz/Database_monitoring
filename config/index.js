import dotenv from 'dotenv';
dotenv.config();

export const schema = process.env.DB_NAME || 'diretorio';

export const PIPELINE_FAST_PATH = process.env.PIPELINE_FAST_PATH === 'true';
export const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 1000;
export const QUEUE_HIGH_WATERMARK = Number(process.env.QUEUE_HIGH_WATERMARK) || 4;
export const QUEUE_LOW_WATERMARK = Number(process.env.QUEUE_LOW_WATERMARK) || 2;
