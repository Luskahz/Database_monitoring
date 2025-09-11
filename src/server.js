import "dotenv/config";              // <- precisa ser a primeira linha
import "../src/utils/bootStrapLogs.js";
import express from "express";
import { startMonitoring } from "./monitoring.js";
import { getPool, query, shutdownPool } from "../config/dbPool.js";

const app = express();
const port = 3000;

(async () => {
  try {
    const version = await query("SELECT VERSION() AS v");
    const packet  = await query("SELECT @@max_allowed_packet AS p");
    const pool = await getPool();
    
    console.log(`[DB] MySQL version: ${version?.[0]?.v} | max_allowed_packet: ${packet?.[0]?.p}`);
    console.log(`[DB] Pool => limit=${pool.pool?.max ?? "n/a"} idleMax=${pool.pool?.maxIdle ?? "n/a"}`);
  } catch (e) {
    console.error("[DB] Falha ao consultar versão/packet:", e?.message || e);
  }
})();

const shutdown = async () => { 
  await shutdownPool(); 
  process.exit(0); 
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startMonitoring();

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
