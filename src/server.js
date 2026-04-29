import "dotenv/config";
import "../src/utils/bootStrapLogs.js";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import os from "node:os";
import { fileURLToPath } from "node:url";

import { startMonitoring } from "./monitoring.js";
import { getPool, query, shutdownPool } from "../config/dbPool.js";
import { logActivity } from "./middleware/logger.js";
import { toNumber } from "./utils/normalizar.js";
import { CONSOLE_LOG_PATH } from "./utils/consoleMirror.js";

console.log(
  `[BOOT] UV_THREADPOOL_SIZE=${process.env.UV_THREADPOOL_SIZE || "default(4)"} | CPUs=${os.cpus().length}`
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, "frontend");
const logsDir = path.resolve(process.cwd(), "logs");
const activityLogPath = path.join(logsDir, "_activity.txt");
const queueLogPath = path.join(logsDir, "_queue.txt");
const globalLogPath = path.resolve(process.cwd(), "loggers", "Logger___global.txt");
const consoleLogPath = CONSOLE_LOG_PATH;

const app = express();

function readServerPort() {
  const parsedPort = toNumber(process.env.PORT, 4001);

  if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
    throw new Error(`PORT inválida para database-monitoring: ${process.env.PORT}`);
  }

  return parsedPort;
}
const port = readServerPort();

const defaultActivityLines = toNumber(process.env.UI_ACTIVITY_LINES, 200);
const defaultActivityTailBytes = toNumber(
  process.env.UI_ACTIVITY_TAIL_BYTES,
  256 * 1024
);
const defaultConsoleTailBytes = toNumber(
  process.env.UI_CONSOLE_TAIL_BYTES,
  1024 * 1024
);
const uiRefreshMs = toNumber(process.env.UI_REFRESH_MS, 5000);

function describeError(err) {
  if (err instanceof Error) {
    return err.stack || err.message;
  }
  if (typeof err === "object") {
    try {
      return JSON.stringify(err);
    } catch {}
  }
  return String(err);
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function noStore(res) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
}

async function safeReadFile(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return { exists: true, text };
  } catch (err) {
    if (err?.code === "ENOENT") {
      return { exists: false, text: "" };
    }
    throw err;
  }
}

async function readTailLines(
  filePath,
  { maxLines = defaultActivityLines, maxBytes = defaultActivityTailBytes } = {}
) {
  let handle;
  try {
    const stats = await fs.stat(filePath);
    const start = Math.max(0, stats.size - maxBytes);
    const length = Math.max(0, stats.size - start);
    const buffer = Buffer.alloc(length);

    handle = await fs.open(filePath, "r");
    await handle.read(buffer, 0, length, start);

    let text = buffer.toString("utf8");
    if (start > 0) {
      const firstBreak = text.indexOf("\n");
      if (firstBreak >= 0) {
        text = text.slice(firstBreak + 1);
      }
    }

    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);

    return {
      exists: true,
      truncated: start > 0,
      size: stats.size,
      lines: lines.slice(-maxLines),
    };
  } catch (err) {
    if (err?.code === "ENOENT") {
      return { exists: false, truncated: false, size: 0, lines: [] };
    }
    throw err;
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function readTailText(
  filePath,
  { maxBytes = defaultConsoleTailBytes } = {}
) {
  let handle;
  try {
    const stats = await fs.stat(filePath);
    const start = Math.max(0, stats.size - maxBytes);
    const length = Math.max(0, stats.size - start);
    const buffer = Buffer.alloc(length);

    handle = await fs.open(filePath, "r");
    await handle.read(buffer, 0, length, start);

    let text = buffer.toString("utf8");
    if (start > 0) {
      const firstBreak = text.indexOf("\n");
      if (firstBreak >= 0) {
        text = text.slice(firstBreak + 1);
      }
    }

    return {
      exists: true,
      truncated: start > 0,
      size: stats.size,
      text,
    };
  } catch (err) {
    if (err?.code === "ENOENT") {
      return { exists: false, truncated: false, size: 0, text: "" };
    }
    throw err;
  } finally {
    await handle?.close().catch(() => {});
  }
}

function normalizeMetricValue(value) {
  const trimmed = String(value ?? "").trim();
  return /^-?\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : trimmed;
}

function parseFileAction(label) {
  const raw = String(label ?? "").trim();
  const match = raw.match(/^(.*)\s+\(([^()]+)\)$/);
  if (!match) {
    return {
      label: raw,
      file: raw,
      action: null,
    };
  }
  return {
    label: raw,
    file: match[1].trim(),
    action: match[2].trim(),
  };
}

function parseProgressPercent(progressText) {
  const match = String(progressText ?? "").match(/(-?\d+(?:\.\d+)?)%/);
  return match ? Number(match[1]) : null;
}

function parseActiveItem(raw) {
  const text = String(raw ?? "").trim();
  const parts = text.split(" :: ");
  const fileMeta = parseFileAction(parts[0] || text);
  const [progressText = "", detail = ""] = String(parts[2] || "").split(" | ");

  return {
    raw: text,
    ...fileMeta,
    stage: parts[1] || null,
    progressText: progressText || null,
    progressPercent: parseProgressPercent(progressText),
    detail: detail || "",
    elapsed: parts[3] || null,
  };
}

function parsePendingItem(raw) {
  const text = String(raw ?? "").trim();
  const parts = text.split(" :: ");
  const fileMeta = parseFileAction(parts[0] || text);

  return {
    raw: text,
    ...fileMeta,
    waiting: parts[1] || null,
  };
}

function parseCompletedItem(raw) {
  const text = String(raw ?? "").trim();
  const parts = text.split(" :: ");
  const fileMeta = parseFileAction(parts[1] || "");

  return {
    raw: text,
    finishedAt: parts[0] || null,
    ...fileMeta,
    status: parts[2] || null,
    duration: parts[3] || null,
  };
}

function extractCount(line) {
  const match = String(line ?? "").match(/\((\d+)\)/);
  return match ? Number(match[1]) : 0;
}

function parseQueueSnapshot(text) {
  const raw = String(text ?? "");
  const snapshot = {
    raw,
    snapshotAt: null,
    filesMaxConcurrent: null,
    activeCount: 0,
    pendingCount: 0,
    completedCount: 0,
    active: [],
    pending: [],
    completed: [],
    metrics: {},
  };

  let section = null;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;

    if (line.startsWith("Snapshot: ")) {
      snapshot.snapshotAt = line.slice("Snapshot: ".length).trim();
      section = null;
      continue;
    }

    if (line.startsWith("FILES_MAX_CONCURRENT: ")) {
      snapshot.filesMaxConcurrent = normalizeMetricValue(
        line.slice("FILES_MAX_CONCURRENT: ".length)
      );
      continue;
    }

    if (line.startsWith("Ativos (")) {
      section = "active";
      snapshot.activeCount = extractCount(line);
      continue;
    }

    if (line.startsWith("Pendentes (")) {
      section = "pending";
      snapshot.pendingCount = extractCount(line);
      continue;
    }

    if (line.startsWith("Conclu")) {
      section = "completed";
      snapshot.completedCount = extractCount(line);
      continue;
    }

    if (line.startsWith("|")) {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex > 1) {
        const key = line.slice(1, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim();
        snapshot.metrics[key] = normalizeMetricValue(value);
      }
      continue;
    }

    if (line.startsWith("DB status erro:")) {
      snapshot.metrics.dbStatusError = line.slice("DB status erro:".length).trim();
      continue;
    }

    if (/^\s*-\s+/.test(line)) {
      const item = line.replace(/^\s*-\s+/, "");
      if (section === "active") snapshot.active.push(parseActiveItem(item));
      if (section === "pending") snapshot.pending.push(parsePendingItem(item));
      if (section === "completed") snapshot.completed.push(parseCompletedItem(item));
    }
  }

  return snapshot;
}

function parseActivityLine(raw, index) {
  const line = String(raw ?? "").trim();
  const match = line.match(/^\[([^\]]+)\]\[([^\]]+)\]\s?(.*)$/);
  if (!match) {
    return {
      id: `${index}`,
      raw: line,
      time: null,
      level: "INFO",
      message: line,
    };
  }

  return {
    id: `${index}-${match[1]}`,
    raw: line,
    time: match[1],
    level: match[2],
    message: match[3],
  };
}

process.on("unhandledRejection", (reason) => {
  const detail = describeError(reason);
  console.error("[process] Unhandled rejection:", detail);
  void logActivity("error", `Unhandled rejection: ${detail}`);
});

process.on("uncaughtException", (err) => {
  const detail = describeError(err);
  console.error("[process] Uncaught exception:", detail);
  void logActivity("error", `Uncaught exception: ${detail}`);
});

app.use("/assets", express.static(frontendDir, { extensions: ["html"] }));

app.get(["/", "/console"], (_req, res) => {
  res.sendFile(path.join(frontendDir, "console.html"));
});

app.get(["/dashboard", "/legacy-dashboard"], (_req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

app.get("/api/health", (_req, res) => {
  noStore(res);
  res.json({
    ok: true,
    now: new Date().toISOString(),
    pid: process.pid,
    uptimeSeconds: Math.floor(process.uptime()),
    nodeVersion: process.version,
    port,
    refreshIntervalMs: uiRefreshMs,
    activityLogPath,
    queueLogPath,
    globalLogPath,
    consoleLogPath,
  });
});

function createLogEndpoint(filePath) {
  return async (req, res, next) => {
    try {
      const maxLines = clampNumber(req.query.limit, 20, 1000, defaultActivityLines);
      const maxBytes = clampNumber(
        req.query.bytes,
        64 * 1024,
        1024 * 1024,
        defaultActivityTailBytes
      );

      const result = await readTailLines(filePath, { maxLines, maxBytes });

      noStore(res);
      res.json({
        exists: result.exists,
        truncated: result.truncated,
        size: result.size,
        path: filePath,
        refreshIntervalMs: uiRefreshMs,
        lines: result.lines.map(parseActivityLine),
      });
    } catch (err) {
      next(err);
    }
  };
}

app.get("/api/queue", async (_req, res, next) => {
  try {
    const result = await safeReadFile(queueLogPath);
    noStore(res);
    res.json({
      exists: result.exists,
      path: queueLogPath,
      refreshIntervalMs: uiRefreshMs,
      snapshot: parseQueueSnapshot(result.text),
    });
  } catch (err) {
    next(err);
  }
});

app.get("/api/activity", createLogEndpoint(activityLogPath));
app.get("/api/global-log", createLogEndpoint(globalLogPath));
app.get("/api/console-log", createLogEndpoint(consoleLogPath));
app.get("/api/console-stream", async (req, res, next) => {
  try {
    const maxBytes = clampNumber(
      req.query.bytes,
      64 * 1024,
      4 * 1024 * 1024,
      defaultConsoleTailBytes
    );
    const result = await readTailText(consoleLogPath, { maxBytes });

    noStore(res);
    res.json({
      exists: result.exists,
      truncated: result.truncated,
      size: result.size,
      path: consoleLogPath,
      refreshIntervalMs: uiRefreshMs,
      text: result.text,
    });
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  const detail = describeError(err);
  console.error("[HTTP] Erro ao atender requisicao:", detail);
  void logActivity("error", `HTTP dashboard error: ${detail}`);
  res.status(500).json({
    ok: false,
    error: "Falha ao atender requisicao do dashboard.",
  });
});

(async () => {
  try {
    const version = await query("SELECT VERSION() AS v");
    const packet = await query("SELECT @@max_allowed_packet AS p");
    const pool = await getPool();

    console.log(`[DB] MySQL version: ${version?.[0]?.v} | max_allowed_packet: ${packet?.[0]?.p}`);
    console.log(`[DB] Pool => limit=${pool.pool?.max ?? "n/a"} idleMax=${pool.pool?.maxIdle ?? "n/a"}`);
  } catch (e) {
    console.error("[DB] Falha ao consultar versao/packet:", e?.message || e);
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
  console.log(`Dashboard disponivel em http://localhost:${port}/`);
  console.log("Para reiniciar o sistema aperte Ctrl+C e rode Npm run dev novamente");
});
