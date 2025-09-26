import os from "os";

setInterval(() => {
  const mem = process.memoryUsage();
  const cpu = os.loadavg();

  console.log(`
  ========== MONITOR ==========
  RSS: ${(mem.rss / 1024 / 1024).toFixed(2)} MB
  Heap Total: ${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB
  Heap Used: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB
  Externo: ${(mem.external / 1024 / 1024).toFixed(2)} MB
  ArrayBuffers: ${(mem.arrayBuffers / 1024 / 1024).toFixed(2)} MB
  CPU Load Avg (1m, 5m, 15m): ${cpu.map(v => v.toFixed(2)).join(", ")}
  =============================
  `);
}, 5000);
