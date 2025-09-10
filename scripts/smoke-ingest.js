import fs from "fs/promises";
import path from "path";
import {
  BATCH_SIZE,
  HIGH_WATERMARK_DEFAULT,
  LOW_WATERMARK_DEFAULT,
} from "../config/index.js";
import streamPipeline, {
  INSERT_MAX_CONCURRENT,
  FILES_MAX_CONCURRENT,
} from "../src/utils/streamPipeline.js";

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
    `[smoke] INSERT_MAX_CONCURRENT=${INSERT_MAX_CONCURRENT} FILES_MAX_CONCURRENT=${FILES_MAX_CONCURRENT} BATCH_SIZE=${BATCH_SIZE} BQ_HWM=${HIGH_WATERMARK_DEFAULT} BQ_LWM=${LOW_WATERMARK_DEFAULT}`
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
