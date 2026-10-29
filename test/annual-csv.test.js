import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { readAnnualCsv } from "../src/utils/readAnnualCsv.js";

async function fixture(t, data) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "annual-csv-"));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert.match(path.basename(dir), /^annual-csv-/);
    return rm(dir, { recursive: true, force: true });
  });
  const file = path.join(dir, "2025.csv");
  await writeFile(file, data);
  return file;
}
test("lê lotes com backpressure, aspas, BOM e hash dos bytes completos", { timeout: 10000 }, async (t) => {
  const text = '\ufeffdata;texto\r\n2025-01-01;"a;b\nc"\r\n' + '2025-12-31;ação\r\n'.repeat(25000);
  const file = await fixture(t, text);
  let count = 0;
  let running = false;
  let chunks = 0;
  const hash = await readAnnualCsv(file, { encoding: "utf8", delimiter: ";", async onRows(rows) {
    assert.equal(running, false);
    running = true;
    chunks++;
    await new Promise((resolve) => setImmediate(resolve));
    if (count === 0) assert.deepEqual(rows[1], ["2025-01-01", "a;b\nc"]);
    count += rows.length;
    running = false;
  } });
  assert.equal(count, 25002);
  assert.ok(chunks > 1);
  assert.equal(hash, createHash("sha256").update(text).digest("hex"));
});
test("rejeita aspas não fechadas em vez de descartar erros do parser", { timeout: 5000 }, async (t) => {
  const file = await fixture(t, 'data;texto\n2025-01-01;"sem fechamento');
  await assert.rejects(readAnnualCsv(file, { encoding: "utf8", delimiter: ";", onRows() {} }), /CSV malformado/);
});
test("propaga falha assíncrona do consumidor e encerra a leitura", { timeout: 5000 }, async (t) => {
  const file = await fixture(t, "data;texto\n" + "2025-01-01;ok\n".repeat(20000));
  let calls = 0;
  await assert.rejects(readAnnualCsv(file, { encoding: "utf8", delimiter: ";", async onRows() {
    calls++;
    throw new Error("falha no lote");
  } }), /falha no lote/);
  assert.equal(calls, 1);
});
test("propaga erro de abertura do arquivo", { timeout: 5000 }, async () => {
  await assert.rejects(readAnnualCsv(path.join(os.tmpdir(), "__missing_annual_csv__"), {
    encoding: "utf8", delimiter: ";", onRows() {},
  }), /ENOENT/);
});
