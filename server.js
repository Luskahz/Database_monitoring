import express from 'express';
import { startMonitoring } from './monitoring/monitoring.js';

const app = express();
const port = 3000;

// Inicia o monitoramento das pastas
startMonitoring();

app.get('/', (req, res) => {
  res.send('Servidor em execução! Monitorando alterações de arquivos.');
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
