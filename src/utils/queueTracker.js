import fs from "fs";
import path from "path";
import { fmtTimeNow } from "../middleware/logger.js";

const LOG_ROOT = path.resolve(process.cwd(), "logs");
const QUEUE_LOG_PATH = path.join(LOG_ROOT, "_queue.txt");
const MAX_COMPLETED = 20;

fs.mkdirSync(LOG_ROOT, { recursive: true });

const state = {
  pending: [],
  active: new Map(),
  fileToJob: new Map(),
  completed: [],
  debounceSize: 0,
  memoryGuardListeners: 0,
  metrics: {
    pendingBatches: 0,
    inFlightInserts: 0,
    lastProgressTs: Date.now(),
    activeFiles: 0,
    filesMaxConcurrent: null,
  },
};

let writeChain = Promise.resolve();
let snapshotScheduled = false;

function scheduleSnapshot() {
  if (snapshotScheduled) return;
  snapshotScheduled = true;
  queueMicrotask(() => {
    snapshotScheduled = false;
    const snapshot = buildSnapshot();
    writeChain = writeChain
      .catch(() => {})
      .then(() => fs.promises.writeFile(QUEUE_LOG_PATH, snapshot, "utf8"))
      .catch((err) => {
        console.error(`[queue] falha ao escrever snapshot:`, err?.message || err);
      });
  });
}

function createJobId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function buildSnapshot() {
  const now = Date.now();
  const lines = [];
  const filesMax = state.metrics.filesMaxConcurrent ?? "n/a";
  const lastProgressAgo = state.metrics.lastProgressTs
    ? `${Math.max(0, now - state.metrics.lastProgressTs)}ms`
    : "n/a";

  lines.push(`Snapshot: ${fmtTimeNow()}`);
  lines.push(`FILES_MAX_CONCURRENT=${filesMax}`);
  lines.push("");

  lines.push(`Ativos (${state.active.size}):`);
  if (state.active.size === 0) {
    lines.push("  - nenhum arquivo em processamento");
  } else {
    for (const { job, progress, stage, detail, startedAt } of state.active.values()) {
      const pct = Number.isFinite(progress) ? `${Math.max(0, Math.min(100, progress * 100)).toFixed(1)}%` : "n/a";
      const base = path.basename(job.filePath || job.id || "arquivo");
      const elapsed = startedAt ? formatDuration(now - startedAt) : "-";
      const detailText = detail ? ` | ${detail}` : "";
      lines.push(`  - ${base} (${job.action || "?"}) :: ${stage || "iniciando"} :: ${pct}${detailText} :: ${elapsed}`);
    }
  }
  lines.push("");

  lines.push(`Pendentes (${state.pending.length}):`);
  if (state.pending.length === 0) {
    lines.push("  - fila vazia");
  } else {
    for (const job of state.pending) {
      const waited = job.enqueuedAt ? formatDuration(now - job.enqueuedAt) : "-";
      const base = path.basename(job.filePath || job.id || "arquivo");
      lines.push(`  - ${base} (${job.action || "?"}) :: aguardando há ${waited}`);
    }
  }
  lines.push("");

  const completed = state.completed.slice(0, MAX_COMPLETED);
  lines.push(`Concluídos (últimos ${completed.length}):`);
  if (completed.length === 0) {
    lines.push("  - nenhum histórico disponível");
  } else {
    for (const item of completed) {
      const base = path.basename(item.job.filePath || item.job.id || "arquivo");
      const duration = item.job.startedAt && item.finishedAt
        ? formatDuration(item.finishedAt - item.job.startedAt)
        : "-";
      const status = item.success ? "ok" : `erro: ${item.message || ""}`.trim();
      const finishedStamp = item.finishedAt
        ? new Date(item.finishedAt).toISOString()
        : fmtTimeNow();
      lines.push(`  - ${finishedStamp} :: ${base} (${item.job.action || "?"}) :: ${status} :: ${duration}`);
    }
  }
  lines.push("");

  lines.push(
    `debounceTimers=${state.debounceSize} | memoryGuardListeners=${state.memoryGuardListeners} | activeFiles=${state.metrics.activeFiles}`
  );
  lines.push(
    `pendingBatches=${state.metrics.pendingBatches} | inFlight=${state.metrics.inFlightInserts} | lastProgressAgo=${lastProgressAgo}`
  );

  return `${lines.join("\n")}\n`;
}

function removePending(jobId) {
  const idx = state.pending.findIndex((j) => j.id === jobId);
  if (idx >= 0) {
    state.pending.splice(idx, 1);
  }
}

export function enqueueFileJob(filePath, action) {
  const job = {
    id: createJobId(),
    filePath,
    action,
    enqueuedAt: Date.now(),
  };
  state.pending.push(job);
  scheduleSnapshot();
  return job;
}

export function ensureJob(job, filePath, action) {
  if (job && job.id) {
    if (!job.filePath) job.filePath = filePath;
    if (!job.action && action) job.action = action;
    return job;
  }
  return {
    id: createJobId(),
    filePath,
    action,
    enqueuedAt: Date.now(),
    orphan: true,
  };
}

export function markJobActive(job, info = {}) {
  if (!job || !job.id) return job;
  removePending(job.id);

  const startedAt = Date.now();
  job.startedAt = job.startedAt || startedAt;
  const record = {
    job,
    stage: info.stage || "iniciando",
    progress: typeof info.progress === "number" ? info.progress : 0,
    detail: info.detail || "",
    startedAt: job.startedAt,
    lastUpdate: Date.now(),
  };
  state.active.set(job.id, record);
  state.fileToJob.set(job.filePath, job.id);
  state.metrics.activeFiles = state.active.size;
  scheduleSnapshot();
  return job;
}

export function updateActiveJob(filePath, patch = {}) {
  if (!filePath) return;
  const jobId = state.fileToJob.get(filePath);
  if (!jobId) return;
  const record = state.active.get(jobId);
  if (!record) return;

  if (typeof patch.progress === "number" && Number.isFinite(patch.progress)) {
    record.progress = Math.max(0, Math.min(1, patch.progress));
  }
  if (typeof patch.stage === "string") {
    record.stage = patch.stage;
  }
  if (typeof patch.detail === "string") {
    record.detail = patch.detail;
  }
  record.lastUpdate = Date.now();
  scheduleSnapshot();
}

export function markJobComplete(job, result = {}) {
  if (!job || !job.id) return;

  removePending(job.id);
  const record = state.active.get(job.id);
  state.active.delete(job.id);
  state.fileToJob.delete(job.filePath);
  state.metrics.activeFiles = state.active.size;

  const finishedAt = Date.now();
  job.finishedAt = finishedAt;
  const success = result.success !== false && !result.error;
  const message = result.message || result.error?.message || result.error || null;

  state.completed.unshift({
    job,
    finishedAt,
    success,
    message: typeof message === "string" ? message : null,
  });
  if (state.completed.length > MAX_COMPLETED) {
    state.completed.length = MAX_COMPLETED;
  }

  scheduleSnapshot();
}

export function updateDebounceSize(size) {
  state.debounceSize = size;
  scheduleSnapshot();
}

export function updateMemoryGuardListeners(count) {
  state.memoryGuardListeners = count;
  scheduleSnapshot();
}

export function updateMetrics(metrics = {}) {
  Object.assign(state.metrics, metrics);
  scheduleSnapshot();
}

export function getJobState(filePath) {
  const jobId = state.fileToJob.get(filePath);
  if (!jobId) return null;
  return state.active.get(jobId) || null;
}

export default {
  enqueueFileJob,
  ensureJob,
  markJobActive,
  markJobComplete,
  updateActiveJob,
  updateDebounceSize,
  updateMemoryGuardListeners,
  updateMetrics,
  getJobState,
};
