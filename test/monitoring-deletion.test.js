import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mock, test } from "node:test";
import { DELETION_QUIET_MS } from "../src/monitoring/deletionGuard.js";

// Substitui os limites externos: nenhum watcher real, conexão ou SQL é criado.
const watcher = new EventEmitter();
const queued = [];
const tasks = [];
const errors = [];
const completed = [];
const deleted = mock.fn(async () => {});
const created = mock.fn(async () => {});
const noop = () => {};
mock.module("chokidar", { defaultExport: { watch: () => watcher } });
mock.module("p-limit", { defaultExport: () => (task) => {
  tasks.push(task);
  return Promise.resolve();
} });
mock.module("../config/index.js", { namedExports: { FILES_MAX_CONCURRENT: 4, STAGING_DIR: null } });
mock.module("../src/controller/Handlers/deletedHandler.js", { defaultExport: deleted });
mock.module("../src/controller/Handlers/createdHandler.js", { defaultExport: created });
mock.module("../src/middleware/errorHandler.js", { namedExports: {
  addInfo: noop, addErro: (message) => errors.push(message),
} });
mock.module("../src/utils/streamPipeline.js", { namedExports: { metrics: {} } });
mock.module("../src/utils/withFileLifecycle.js", { namedExports: { getActiveFilesCount: () => 0 } });
mock.module("../src/utils/memoryGuard.js", { namedExports: { memoryGuard: { listenerCount: () => 0 } } });
mock.module("../src/monitoring/watchdog.js", { namedExports: { startWatchdog: noop } });
mock.module("../src/utils/gracefulShutdown.js", { namedExports: { setupGracefulShutdown: noop } });
mock.module("../src/middleware/logger.js", { namedExports: { endAllLoggers: noop } });
mock.module("../config/dbPool.js", { namedExports: { shutdownPool: noop } });
mock.module("../src/utils/queueTracker.js", { namedExports: {
  enqueueFileJob: (filePath, action) => {
    const job = { id: String(queued.length), filePath, action };
    queued.push(job);
    return job;
  },
  updateDebounceSize: noop,
  updateMetrics: noop,
  markJobComplete: (job, result) => completed.push({ job, result }),
} });

let scenario = 0;
async function setup(t) {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  t.mock.method(console, "log", noop);
  t.mock.method(console, "error", noop);
  queued.length = tasks.length = errors.length = completed.length = 0;
  deleted.mock.resetCalls();
  created.mock.resetCalls();
  watcher.removeAllListeners();
  const { startMonitoring } = await import(`../src/monitoring.js?test=${scenario++}`);
  await startMonitoring();
}

function unlinkFiles(count, prefix = "removed") {
  for (let i = 0; i < count; i++) watcher.emit("unlink", `__deletion_test_missing__/${prefix}-${i}.csv`);
}

function releaseBatch(t) {
  t.mock.timers.tick(DELETION_QUIET_MS);
  t.mock.timers.tick(2000);
}

test("35 remoções passam pela fila e chegam ao handler após a espera", async (t) => {
  await setup(t);
  unlinkFiles(35);
  t.mock.timers.tick(2000);
  assert.equal(queued.length, 0);
  releaseBatch(t);
  assert.equal(queued.length, 35);
  for (const task of tasks) await task();
  assert.equal(deleted.mock.callCount(), 35);
  assert.equal(errors.length, 0);
});

test("36 remoções bloqueiam antes da fila e mantêm o bloqueio", async (t) => {
  await setup(t);
  unlinkFiles(36);
  releaseBatch(t);
  unlinkFiles(10, "posterior");
  releaseBatch(t);
  assert.equal(queued.length, 0);
  assert.equal(deleted.mock.callCount(), 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /EXCLUSÃO EM MASSA BLOQUEADA.*36.*35/);
});

test("remoção da árvore em várias varreduras não libera os primeiros arquivos", async (t) => {
  await setup(t);
  unlinkFiles(20);
  t.mock.timers.tick(8000);
  unlinkFiles(20, "segunda-varredura");
  t.mock.timers.tick(8000);
  unlinkFiles(200, "restante");
  releaseBatch(t);
  assert.equal(queued.length, 0);
  assert.equal(deleted.mock.callCount(), 0);
  assert.equal(errors.length, 1);
});

test("arquivo recriado sai do lote e segue pelo handler de criação", async (t) => {
  await setup(t);
  const file = "__deletion_test_missing__/recriado.csv";
  watcher.emit("unlink", file);
  watcher.emit("add", file);
  releaseBatch(t);
  for (const task of tasks) await task();
  assert.deepEqual(queued.map((job) => job.action), ["created"]);
  assert.equal(deleted.mock.callCount(), 0);
  assert.equal(created.mock.callCount(), 1);
});

test("ignora não CSV e contabiliza .csv.inf no limite", async (t) => {
  await setup(t);
  for (let i = 0; i < 100; i++) watcher.emit("unlink", `${i}.txt`);
  unlinkFiles(35);
  watcher.emit("unlink", "__deletion_test_missing__/extra.csv.inf");
  releaseBatch(t);
  assert.equal(queued.length, 0);
  assert.equal(errors.length, 1);
});

test("bloqueio também cancela exclusões de lote anterior ainda aguardando execução", async (t) => {
  await setup(t);
  unlinkFiles(35);
  releaseBatch(t);
  assert.equal(queued.length, 35);
  unlinkFiles(36, "novo-lote");
  for (const task of tasks) await task();
  assert.equal(deleted.mock.callCount(), 0);
  assert.equal(completed.length, 35);
  assert.ok(completed.every(({ result }) => result.success === false));
});

test("bloqueio de exclusões preserva o processamento de modificações", async (t) => {
  await setup(t);
  unlinkFiles(36);
  watcher.emit("change", "__deletion_test_missing__/modificado.csv");
  releaseBatch(t);
  for (const task of tasks) await task();
  assert.equal(created.mock.callCount(), 1);
  assert.equal(deleted.mock.callCount(), 0);
});

test("unlink cancela debounce de modificação ainda pendente", async (t) => {
  await setup(t);
  const file = "__deletion_test_missing__/modificado.csv";
  watcher.emit("change", file);
  watcher.emit("unlink", file);
  t.mock.timers.tick(2000);
  assert.equal(queued.length, 0);
  releaseBatch(t);
  for (const task of tasks) await task();
  assert.equal(created.mock.callCount(), 0);
  assert.equal(deleted.mock.callCount(), 1);
});

for (const when of ["antes da fila", "aguardando execução"]) {
  test(`não apaga dados se o arquivo reaparecer ${when}`, async (t) => {
    await setup(t);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "deletion-guard-"));
    const file = path.join(directory, "restaurado.csv");
    t.after(() => {
      fs.unlinkSync(file);
      fs.rmdirSync(directory);
    });
    watcher.emit("unlink", file);
    t.mock.timers.tick(DELETION_QUIET_MS);
    if (when === "aguardando execução") t.mock.timers.tick(2000);
    fs.writeFileSync(file, "id\n1\n");
    t.mock.timers.tick(2000);
    for (const task of tasks) await task();
    assert.equal(deleted.mock.callCount(), 0);
    assert.equal(queued.length, when === "antes da fila" ? 0 : 1);
    assert.equal(completed.length, when === "antes da fila" ? 0 : 1);
  });
}
