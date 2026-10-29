import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { annualDestination, annualRange } from "../src/utils/annualLayout.js";
import { withTableJobLock } from "../src/utils/tableJobLock.js";

const root = path.resolve("__annual_monitor_root__");
test("anual exige arquivo AAAA.csv na pasta da tabela e não aceita nomes parecidos", () => {
  assert.deepEqual(annualDestination(path.join(root, "vendas", "2025.CSV"), root), {
    nome_arquivo: "2025.csv", ano: "2025", mes: "anual", dia: null,
    tabela_destino: "vendas", periodicidade: "anual",
  });
  for (const name of ["relatorio_2025.csv", "2025.csv.inf", "25.csv", "20250.csv", "0000.csv", "9999.csv", "2025.csv.bak", "cadastro.csv"]) {
    assert.throws(() => annualDestination(path.join(root, "vendas", name), root), /\[Anual\]/);
  }
  for (const file of [path.join(root, "vendas", "2024", "2025.csv"), path.join(root, "2025.csv"), path.resolve("__outside__", "vendas", "2025.csv")]) {
    assert.throws(() => annualDestination(file, root), /\[Anual\]/);
  }
});
test("identifica a tabela pelo pai do arquivo, independente das categorias anteriores", () => {
  for (const categories of [[], ["Financeiro"], ["Relatórios corporativos", "Financeiro"]]) {
    assert.deepEqual(annualDestination(path.join(root, ...categories, "12_06_01", "2026.csv"), root), {
      nome_arquivo: "2026.csv", ano: "2026", mes: "anual", dia: null,
      tabela_destino: "12_06_01", periodicidade: "anual",
    });
  }
  for (const table of ["2025", "global", "tabela-inválida"]) {
    assert.throws(() => annualDestination(path.join(root, "Financeiro", table, "2026.csv"), root), /\[Anual\]/);
  }
  assert.throws(() => annualDestination(path.join(root, "Financeiro", "12_06_01", "9999.csv"), root), /\[Anual\]/);
  assert.throws(() => annualDestination(path.resolve("__outside__", "Financeiro", "12_06_01", "2026.csv"), root), /\[Anual\]/);
});
test("layout anual não captura caminhos mensais, diários e globais existentes", () => {
  for (const file of ["vendas/2025/janeiro.csv", "vendas/2025/janeiro/01.csv", "cadastros/global/cadastro.csv", "cadastros/2025/cadastro.csv"]) {
    assert.equal(annualDestination(path.join(root, file), root), null);
    assert.equal(annualDestination(path.join(root, "Financeiro", file), root), null);
  }
});
test("range anual só existe com marcador, nome e ano concordantes", () => {
  assert.deepEqual(annualRange({ ano: 2024, mes: "anual", nome_arquivo: "2024.csv", dia: null }), ["2024-01-01", "2025-01-01"]);
  for (const meta of [{ ano: 2025 }, { ano: 2025, mes: "anual" },
    { ano: 2025, mes: "anual", nome_arquivo: "2024.csv" },
    { ano: 2025, mes: "anual", nome_arquivo: "2025.csv", dia: 1 }]) {
    assert.equal(annualRange(meta), null);
  }
});
test("serializa a mesma tabela, libera após erro e permite outras tabelas", async () => {
  const order = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const first = withTableJobLock("vendas", async () => { order.push("first"); await gate; throw new Error("cancelado"); });
  const failed = assert.rejects(first, /cancelado/);
  const second = withTableJobLock("VENDAS", async () => { order.push("second"); });
  await withTableJobLock("outra", async () => { order.push("other"); });
  assert.deepEqual(order, ["first", "other"]);
  release();
  await failed;
  await second;
  assert.deepEqual(order, ["first", "other", "second"]);
});
