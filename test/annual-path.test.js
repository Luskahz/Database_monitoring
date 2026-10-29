import assert from "node:assert/strict";
import path from "node:path";
import { mock, test } from "node:test";

// Executa parser/range/política reais com SQL e logs substituídos, sem conexão ao banco.
const queries = [];
const query = async (sql, params) => {
  queries.push({ sql, params });
  if (sql.includes("SHOW INDEX")) return [{ Column_name: "data" }];
  if (sql.includes("DELETE FROM")) return { affectedRows: 0 };
  return [{ found: 1 }];
};
const noop = () => {};
mock.module("../config/index.js", { namedExports: { schema: "test_only", PIPELINE_FAST_PATH: false } });
mock.module("../config/dbPool.js", { namedExports: { query, execute: query, getPool: () => ({}) } });
mock.module("../src/middleware/errorHandler.js", { namedExports: { addInfo: noop, addAviso: noop, addErro: noop } });
mock.module("../src/middleware/logger.js", { namedExports: {
  logActivity: noop, writeHeadersDiff: noop, shortPath: (value) => value,
} });
const { destinoByFilePath } = await import("../src/controller/createDataController.js");
const { computeDateRange, buildRangeFromMetadados, deleteFromTable } = await import("../src/model/tableModel.js");
const { decideOverlapPolicy } = await import("../src/utils/decideOverlapPolicy.js");

test("AAAA.csv identifica ano e tabela pelo pai do arquivo, com categorias anteriores", () => {
  for (const directories of [["12_06_01"], ["Financeiro", "12_06_01"], ["Relatórios", "Financeiro", "12_06_01"]]) {
    assert.deepEqual(destinoByFilePath(path.join("raiz", ...directories, "2026.CSV")), {
      nome_arquivo: "2026.csv", ano: "2026", mes: "anual", dia: null, tabela_destino: "12_06_01",
    });
  }
  for (const name of ["relatorio_2026.csv", "26.csv", "20260.csv", "2026.csv.inf", "2026.txt"]) {
    assert.notEqual(destinoByFilePath(path.join("raiz", "Financeiro", "12_06_01", name)).mes, "anual");
  }
});

test("interpretação mensal, diária e global permanece a mesma", () => {
  for (const [suffix, expected] of [
    [["vendas", "2026", "janeiro.csv"], { nome_arquivo: "janeiro.csv", ano: "2026", mes: "janeiro", dia: null, tabela_destino: "vendas" }],
    [["vendas", "2026", "janeiro", "01.csv"], { nome_arquivo: "01.csv", ano: "2026", mes: "janeiro", dia: "01", tabela_destino: "vendas" }],
    [["cadastro", "global", "cadastro.csv"], { nome_arquivo: "cadastro.csv", ano: "global", mes: "cadastro", dia: null, tabela_destino: "cadastro" }],
  ]) assert.deepEqual(destinoByFilePath(path.join("raiz", "Financeiro", ...suffix)), expected);
  assert.deepEqual(computeDateRange({ ano: "2024", mes: "fevereiro" }), ["2024-02-01", "2024-03-01"]);
  assert.deepEqual(computeDateRange({ ano: "2024", mes: "fevereiro", dia: "29" }), ["2024-02-29", "2024-03-01"]);
});

test("período anual chega à política de overlap e à exclusão legadas", async () => {
  const destino = destinoByFilePath(path.join("raiz", "Financeiro", "12_06_01", "2026.csv"));
  const meta = { ...destino, tabela: destino.tabela_destino, coluna_data: "data" };
  const range = buildRangeFromMetadados(meta);
  assert.deepEqual(range, { start: "2026-01-01", end: "2026-12-31", endExclusive: "2027-01-01" });
  assert.deepEqual(computeDateRange({ ano: "2024", mes: "anual", dia: null }), ["2024-01-01", "2025-01-01"]);
  queries.length = 0;
  const overlap = await decideOverlapPolicy({ table: meta.tabela, dateCol: meta.coluna_data, range });
  assert.equal(overlap.strategy, "replace");
  assert.deepEqual(queries[0].params, [range.start, range.endExclusive]);
  await deleteFromTable(meta);
  const deletion = queries.find((entry) => entry.sql.includes("DELETE FROM"));
  assert.match(deletion.sql, /WHERE `data` >= \? AND `data` < \?/);
  assert.deepEqual(deletion.params, [range.start, range.endExclusive]);
});
