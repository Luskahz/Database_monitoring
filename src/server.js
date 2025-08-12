import "../src/utils/bootStrapLogs.js"; 
import express from "express";
import { startMonitoring } from "./monitoring.js";

const app = express();
const port = 3000;


startMonitoring();


app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
