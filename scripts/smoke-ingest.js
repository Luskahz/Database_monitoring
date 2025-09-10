import fs from "fs/promises";
import path from "path";
import {
  INSERT_CONCURRENCY,
  FILES_CONCURRENCY,
  BATCH_SIZE,
  BATCH_QUEUE_HIGH_WATERMARK,
  BATCH_QUEUE_LOW_WATERMARK,
} from "../src/config/index.js";
import streamPipeline from "../src/utils/streamPipeline.js";

async function createCsv(file) {
  const content = "col1,col2\n1,2\n3,4\n";
  await fs.writeFile(file, content);
}

async function runFile(filePath) {
  const metadados = {
    caminho_original: filePath,
    tabela: "dummy",
    colunas_json: ["col1", "col2"],
    colunas_tabela: [{ name: "col1" }, { name: "col2" }],
    encoding: "utf8",
    delimiter: ",",
  };
  const tipos = { col1: "string", col2: "string" };
  const insertBatchFn = async (_t, lote) => {
    console.log(`[mockInsert] start len=${lote.length}`);
    await new Promise((r) => setTimeout(r, 50));
    console.log(`[mockInsert] end len=${lote.length}`);
  };
  const insertRegisterFn = async () => new Promise((r) => setTimeout(r, 5));
  await streamPipeline(metadados, tipos, {}, {
    computeHash: false,
    insertBatchFn,
    insertRegisterFn,
  });
}

async function main() {
  console.log(
    `[smoke] INSERT_CONCURRENCY=${INSERT_CONCURRENCY} FILES_CONCURRENCY=${FILES_CONCURRENCY} BATCH_SIZE=${BATCH_SIZE} BQ_HWM=${BATCH_QUEUE_HIGH_WATERMARK} BQ_LWM=${BATCH_QUEUE_LOW_WATERMARK}`
  );
  const tmpDir = path.join(process.cwd(), "tmp-smoke");
  await fs.mkdir(tmpDir, { recursive: true });
  const f1 = path.join(tmpDir, "a.csv");
  const f2 = path.join(tmpDir, "b.csv");
  await Promise.all([createCsv(f1), createCsv(f2)]);
  await Promise.all([runFile(f1), runFile(f2)]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
