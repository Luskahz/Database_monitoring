import assert from "node:assert/strict";
import { test } from "node:test";
import { createDeletionGuard, DELETION_QUIET_MS } from "../src/monitoring/deletionGuard.js";

function setup(t) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const batches = [];
  const errors = [];
  const guard = createDeletionGuard({
    onBatch: (files) => batches.push(files),
    onBlocked: (count) => errors.push(count),
  });
  return { guard, batches, errors };
}

for (const count of [1, 35]) {
  test(`libera ${count} arquivos somente após a janela completa`, (t) => {
    const { guard, batches, errors } = setup(t);
    for (let i = 0; i < count; i++) guard.add(`${i}.csv`);
    t.mock.timers.tick(DELETION_QUIET_MS - 1);
    assert.equal(batches.length, 0);
    t.mock.timers.tick(1);
    assert.equal(batches.length, 1);
    assert.equal(batches[0].length, count);
    assert.deepEqual(errors, []);
  });
}

test("bloqueia todo o lote de 36, inclusive eventos posteriores", (t) => {
  const { guard, batches, errors } = setup(t);
  for (let i = 0; i < 500; i++) guard.add(`${i}.csv`);
  t.mock.timers.tick(DELETION_QUIET_MS * 10);
  guard.add("outra-remocao.csv");
  t.mock.timers.tick(DELETION_QUIET_MS);
  assert.deepEqual(batches, []);
  assert.deepEqual(errors, [36]);
  assert.equal(guard.isBlocked(), true);
});

test("agrupa remoções distribuídas entre varreduras e reinicia a espera", (t) => {
  const { guard, batches, errors } = setup(t);
  for (let i = 0; i < 35; i++) guard.add(`${i}.csv`);
  t.mock.timers.tick(8000);
  guard.add("0.csv");
  t.mock.timers.tick(8000);
  assert.deepEqual(batches, []);
  guard.add("36.csv");
  t.mock.timers.tick(DELETION_QUIET_MS);
  assert.deepEqual(batches, []);
  assert.deepEqual(errors, [36]);
});

test("deduplica caminhos e retira arquivos recriados", (t) => {
  const { guard, batches, errors } = setup(t);
  for (let i = 0; i < 100; i++) guard.add("repetido.csv");
  guard.add("recriado.csv");
  guard.cancel("recriado.csv");
  t.mock.timers.tick(DELETION_QUIET_MS);
  assert.deepEqual(batches, [["repetido.csv"]]);
  assert.deepEqual(errors, []);
});

test("não libera lote vazio e permite novo lote após cancelar todos", (t) => {
  const { guard, batches } = setup(t);
  guard.add("recriado.csv");
  guard.cancel("recriado.csv");
  t.mock.timers.tick(DELETION_QUIET_MS);
  assert.deepEqual(batches, []);
  guard.add("outro.csv");
  t.mock.timers.tick(DELETION_QUIET_MS);
  assert.deepEqual(batches, [["outro.csv"]]);
});

test("reinicia a contagem somente após liberar um lote válido", (t) => {
  const { guard, batches, errors } = setup(t);
  for (let batch = 0; batch < 2; batch++) {
    for (let i = 0; i < 35; i++) guard.add(`${batch}-${i}.csv`);
    t.mock.timers.tick(DELETION_QUIET_MS);
  }
  assert.deepEqual(batches.map((files) => files.length), [35, 35]);
  assert.deepEqual(errors, []);
});
