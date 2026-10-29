import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mock, test } from "node:test";

// Opt-in: exclusivamente MySQL de testes em loopback, sem ler destinos de .env.
test("carga anual no MySQL isolado", { skip: !process.env.ANNUAL_TEST_MYSQL_PORT, timeout: 90000 }, async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "annual-db-"));
  const root = path.join(directory, "Diretórios_SQL");
  const originalCwd = process.cwd();
  process.chdir(directory); // .env e logs operacionais do serviço ficam fora do teste.
  const completed = [];
  const noop = () => {};
  mock.module("../src/utils/queueTracker.js", { namedExports: {
    ensureJob: (job, filePath, action) => job || { id: `${completed.length}`, filePath, action },
    markJobActive: (job) => job,
    markJobComplete: (_job, result) => completed.push(result),
    updateActiveJob: noop, updateMemoryGuardListeners: noop, updateMetrics: noop,
  } });
  Object.assign(process.env, { DB_HOST: "127.0.0.1", DB_PORT: process.env.ANNUAL_TEST_MYSQL_PORT,
    DB_USER: "root", DB_PASSWORD: "", DB_NAME: "annual_test", MONITOR_PATH: root,
    PIPELINE_FAST_PATH: process.env.ANNUAL_TEST_FAST_PATH || "0", DB_POOL_MAX: "4" });
  const { query, shutdownPool } = await import("../config/dbPool.js");
  const { createMetadadosController, createLogDataController, destinoByFilePath } = await import("../src/controller/createDataController.js");
  const { importAnnualFile, deleteAnnualFile } = await import("../src/model/annualImport.js");
  const { manageInsertController } = await import("../src/controller/managerDataController.js");
  const { computeDateRange, deleteFromTable } = await import("../src/model/tableModel.js");
  const { endAllLoggers } = await import("../src/middleware/logger.js");
  const { memoryGuard } = await import("../src/utils/memoryGuard.js");
  const { default: createdHandler } = await import("../src/controller/Handlers/createdHandler.js");
  const { default: deletedHandler } = await import("../src/controller/Handlers/deletedHandler.js");
  const { withTableJobLock } = await import("../src/utils/tableJobLock.js");
  const { getAllHashesFromTable } = await import("../src/model/logModel.js");
  t.after(async () => {
    await endAllLoggers(); memoryGuard.stop?.(); await shutdownPool();
    process.chdir(originalCwd);
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.match(path.basename(directory), /^annual-db-/);
    await rm(directory, { recursive: true, force: true });
  });
  await query(`CREATE TABLE IF NOT EXISTS log_ingestao (
    id INT PRIMARY KEY AUTO_INCREMENT, tabela_destino VARCHAR(50) NOT NULL, nome_arquivo VARCHAR(50) NOT NULL,
    ano INT NOT NULL, mes VARCHAR(25), dia INT, coluna_data VARCHAR(25), data_upload DATETIME NOT NULL,
    hash_arquivo CHAR(64) NOT NULL, file_size_bytes BIGINT, total_linhas INT, sucesso TINYINT NOT NULL,
    mensagem_erro TEXT, caminho VARCHAR(100)) ENGINE=InnoDB`);

  const table = "annual_sales";
  async function reset(sql = "id INT PRIMARY KEY, data DATE NOT NULL, valor VARCHAR(10)", engine = "InnoDB") {
    await query(`DROP TABLE IF EXISTS ${table}`);
    await query(`CREATE TABLE ${table} (${sql}) ENGINE=${engine}`);
    await query("DELETE FROM log_ingestao");
  }
  async function seed() {
    await query(`INSERT INTO ${table} VALUES (10, '2024-12-31', 'antes'), (20, '2025-06-01', 'antigo'), (30, '2026-01-01', 'depois')`);
  }
  async function content(text, name = "2025.csv") {
    const file = path.join(root, table, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
    const meta = await createMetadadosController(file, "created");
    const log = createLogDataController(meta);
    return { meta, log };
  }
  const snapshot = () => query(`SELECT * FROM ${table} ORDER BY id`);
  async function expectPreserved(text, error) {
    const before = await snapshot();
    await assert.rejects(async () => {
      const { meta, log } = await content(text);
      await importAnnualFile(meta, log);
    }, error);
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual(await query("SELECT id FROM log_ingestao"), []);
  }

  await t.test("preserva o parser mensal/diário/global e ranges legados", () => {
    assert.deepEqual(destinoByFilePath(path.join(root, "vendas", "2025", "janeiro.csv")), {
      nome_arquivo: "janeiro.csv", ano: "2025", mes: "janeiro", dia: null, tabela_destino: "vendas",
    });
    assert.deepEqual(destinoByFilePath(path.join(root, "vendas", "2025", "janeiro", "01.csv")), {
      nome_arquivo: "01.csv", ano: "2025", mes: "janeiro", dia: "01", tabela_destino: "vendas",
    });
    assert.deepEqual(destinoByFilePath(path.join(root, "cadastro", "global", "cadastro.csv")), {
      nome_arquivo: "cadastro.csv", ano: "global", mes: "cadastro", dia: null, tabela_destino: "cadastro",
    });
    assert.deepEqual(computeDateRange({ ano: 2024, mes: "fevereiro" }), ["2024-02-01", "2024-03-01"]);
    assert.deepEqual(computeDateRange({ ano: 2024, mes: "fevereiro", dia: "29" }), ["2024-02-29", "2024-03-01"]);
    assert.equal(computeDateRange({ ano: 2024, mes: null }), null);
  });
  await t.test("substitui somente o ano, grava log e reprocessa arquivo idêntico", async () => {
    await reset(); await seed();
    const { meta, log } = await content("id;data;valor\n1;01/01/2025;novo\n2;2025-12-31;fim\n");
    assert.equal(meta.periodicidade, "anual");
    assert.deepEqual(meta.range, { start: "2025-01-01", end: "2025-12-31", endExclusive: "2026-01-01" });
    const result = await manageInsertController(meta, log);
    assert.equal(result.inseridos, 2);
    assert.equal(log.committedWithData, true);
    let rows = await snapshot();
    assert.deepEqual(rows.map((r) => r.id), [1, 2, 10, 30]);
    assert.deepEqual((await query("SELECT ano, mes, total_linhas, sucesso FROM log_ingestao"))[0], { ano: 2025, mes: "anual", total_linhas: 2, sucesso: 1 });
    await query(`UPDATE ${table} SET valor = 'alterado' WHERE id = 1`);
    await manageInsertController(meta, log);
    rows = await snapshot();
    assert.equal(rows.find((r) => r.id === 1).valor, "novo");
  });
  for (const [label, text, error] of [
    ["ano anterior", "id;data;valor\n1;2024-12-31;x\n", /fora de 2025/],
    ["ano seguinte", "id;data;valor\n1;2026-01-01;x\n", /fora de 2025/],
    ["data vazia", "id;data;valor\n1;;x\n", /Data vazia/],
    ["data impossível", "id;data;valor\n1;2025-02-29;x\n", /Valor inválido/],
    ["vazio", "", /vazio|cabeçalho/],
    ["apenas cabeçalho", "id;data;valor\n", /vazio|cabeçalho/],
    ["sem coluna de data", "id;valor\n1;x\n", /Colunas ausentes/],
    ["cabeçalho duplicado", "id;data;data\n1;2025-01-01;x\n", /duplicados/],
    ["coluna desconhecida", "id;data;outra\n1;2025-01-01;x\n", /Cabeçalhos incompatíveis/],
    ["linha truncada", "id;data;valor\n1;2025-01-01\n", /Quantidade de campos/],
    ["CSV malformado", 'id;data;valor\n1;2025-01-01;"aberto', /CSV malformado/],
    ["chave duplicada no CSV", "id;data;valor\n1;2025-01-01;x\n1;2025-02-01;y\n", /Duplicate entry/],
    ["chave de outro ano", "id;data;valor\n10;2025-01-01;x\n", /Duplicate entry/],
    ["valor longo", "id;data;valor\n1;2025-01-01;valor maior que limite\n", /Data too long/],
  ]) {
    await t.test(`bloqueia ${label} sem alterar o destino`, async () => { await reset(); await seed(); await expectPreserved(text, error); });
  }
  await t.test("erro tardio após vários lotes mantém os dados anteriores", async () => {
    await reset(); await seed();
    const text = "id;data;valor\n" + Array.from({ length: 2001 }, (_, i) => `${i + 100};2025-01-01;ok\n`).join("") + "9999;2026-01-01;erro\n";
    await expectPreserved(text, /fora de 2025/);
  });
  await t.test("falha no log após DELETE/INSERT também desfaz a substituição", async () => {
    await reset(); await seed();
    const before = await snapshot();
    const { meta, log } = await content("id;data;valor\n1;2025-01-01;novo\n");
    log.caminho_original = "x".repeat(101);
    await assert.rejects(importAnnualFile(meta, log), /Data too long/);
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual(await query("SELECT id FROM log_ingestao"), []);
  });
  await t.test("handlers completos: sucesso único no log, falha visível e exclusão anual", async () => {
    await reset(); await seed();
    const file = path.join(root, table, "2025.csv");
    await writeFile(file, "id;data;valor\n1;2025-01-01;novo\n");
    await createdHandler(file, "created");
    assert.equal(completed.at(-1).success, true);
    assert.equal((await query("SELECT id FROM log_ingestao WHERE sucesso = 1")).length, 1);
    const before = await snapshot();
    await writeFile(file, "id;data;valor\n1;2026-01-01;erro\n");
    await assert.rejects(createdHandler(file, "modified"), /fora de 2025/);
    assert.equal(completed.at(-1).success, false);
    assert.deepEqual(await snapshot(), before);
    await assert.rejects(deletedHandler(file, "deleted"), /reapareceu/);
    await rm(file);
    await deletedHandler(file, "deleted");
    assert.deepEqual((await snapshot()).map((r) => r.id), [10, 30]);
  });
  await t.test("carga mensal após anual não é ignorada por hash antigo", async () => {
    await reset(); await seed();
    const file = path.join(root, table, "2025", "janeiro.csv");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "id;data;valor\n1;2025-01-01;mensal\n");
    await createdHandler(file, "created");
    const annual = await content("id;data;valor\n2;2025-01-01;anual\n3;2025-06-01;junho\n");
    await importAnnualFile(annual.meta, annual.log);
    const [old] = await query("SELECT hash_arquivo, sucesso FROM log_ingestao WHERE nome_arquivo = 'janeiro.csv' ORDER BY id DESC LIMIT 1");
    assert.equal(old.sucesso, 0);
    assert.ok(!(await getAllHashesFromTable({ tabela: table })).some((r) => r.hash_arquivo === old.hash_arquivo));
    // Remover o mensal antigo não pode apagar a carga anual atual.
    await rm(file);
    await assert.rejects(deletedHandler(file, "deleted"), /período já foi substituído/);
    assert.ok((await snapshot()).some((r) => r.id === 2));
    await writeFile(file, "id;data;valor\n1;2025-01-01;mensal\n");
    await createdHandler(file, "created");
    assert.deepEqual((await snapshot()).map((r) => r.id), [1, 3, 10, 30]);
  });
  await t.test("overlap mensal é recalculado após aguardar uma carga anual", async () => {
    await reset(); await seed();
    const annual = await content("id;data;valor\n1;2025-01-01;anual\n2;2025-06-01;junho\n");
    const monthlyFile = path.join(root, table, "2025", "janeiro.csv");
    await mkdir(path.dirname(monthlyFile), { recursive: true });
    await writeFile(monthlyFile, "id;data;valor\n3;2025-01-02;mensal\n");
    const monthly = await createMetadadosController(monthlyFile, "created");
    assert.equal(monthly.overlap.hasOverlap, false);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const lock = withTableJobLock(table, () => gate);
    const annualJob = manageInsertController(annual.meta, annual.log);
    const monthlyJob = manageInsertController(monthly, createLogDataController(monthly));
    release();
    await Promise.all([lock, annualJob, monthlyJob]);
    assert.deepEqual((await snapshot()).map((r) => r.id), [2, 3, 10, 30]);
  });
  await t.test("aceita ano bissexto e AUTO_INCREMENT omitido", async () => {
    await reset("id INT AUTO_INCREMENT PRIMARY KEY, data DATE NOT NULL, valor VARCHAR(10)");
    const { meta, log } = await content("data;valor\n2024-02-29;bissexto\n", "2024.csv");
    await importAnnualFile(meta, log);
    assert.equal((await snapshot()).length, 1);
  });
  await t.test("rejeita cadastro sem DATE, DATE ambígua e engine não transacional", async () => {
    for (const [sql, engine, error] of [["id INT PRIMARY KEY, valor VARCHAR(10)", "InnoDB", /exatamente uma/],
      ["id INT PRIMARY KEY, data DATE, outra DATE, valor VARCHAR(10)", "InnoDB", /exatamente uma/],
      ["id INT PRIMARY KEY, data DATE, valor VARCHAR(10)", "MyISAM", /InnoDB/]]) {
      await reset(sql, engine);
      await assert.rejects(content("id;data;valor\n1;2025-01-01;x\n"), error);
    }
  });
  await t.test("valida data GENERATED efetiva no staging", async () => {
    await reset("id INT PRIMARY KEY, raw_date VARCHAR(10), valor VARCHAR(10), data DATE GENERATED ALWAYS AS (cast(raw_date as date)) STORED");
    let fixture = await content("id;raw_date;valor\n1;2025-02-28;ok\n");
    await importAnnualFile(fixture.meta, fixture.log);
    const before = await snapshot();
    fixture = await content("id;raw_date;valor\n2;2026-01-01;erro\n");
    await assert.rejects(importAnnualFile(fixture.meta, fixture.log), /Datas calculadas/);
    assert.deepEqual(await snapshot(), before);
  });
  await t.test("DELETE anual genérico é bloqueado e unlink usa ano/log validados", async () => {
    await reset(); await seed();
    const { meta, log } = await content("id;data;valor\n1;2025-01-01;novo\n");
    await importAnnualFile(meta, log);
    await assert.rejects(deleteFromTable(meta), /fluxo transacional/);
    const [stored] = await query("SELECT * FROM log_ingestao ORDER BY id DESC LIMIT 1");
    stored.caminho_original = meta.caminho_original;
    await assert.rejects(deleteAnnualFile({ ...stored, ano: 2024 }), /inconsistentes/);
    await assert.rejects(deleteAnnualFile({ ...stored, sucesso: 0 }), /bem-sucedida/);
    const result = await deleteAnnualFile(stored);
    assert.equal(result.removidos, 1);
    assert.deepEqual((await snapshot()).map((r) => r.id), [10, 30]);
    assert.deepEqual(await query("SELECT id FROM log_ingestao"), []);
  });
  await t.test("tabelas com trigger são bloqueadas antes de excluir", async () => {
    await reset(); await seed();
    await query(`CREATE TRIGGER annual_trigger BEFORE INSERT ON ${table} FOR EACH ROW SET NEW.valor = 'trigger'`);
    await assert.rejects(content("id;data;valor\n1;2025-01-01;novo\n"), /trigger/);
  });
  await t.test("bloqueia cascata em tabela dependente", async () => {
    await reset(); await seed();
    await query(`CREATE TABLE annual_child (id INT PRIMARY KEY, parent_id INT,
      FOREIGN KEY (parent_id) REFERENCES ${table}(id) ON DELETE CASCADE) ENGINE=InnoDB`);
    try {
      await query("INSERT INTO annual_child VALUES (1, 20)");
      await assert.rejects(content("id;data;valor\n1;2025-01-01;novo\n"), /FK CASCADE/);
      assert.equal((await query("SELECT * FROM annual_child")).length, 1);
    } finally { await query("DROP TABLE annual_child"); }
  });
});
