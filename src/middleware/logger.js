import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getAllErrors, clearAllErrors, addErro } from "./errorHandler.js";
import colunsValidator from "../utils/colunsValidator.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Gera o texto do logger a partir de um objeto genérico de dados (metadados ou logData)
 * @param {Object} dadosLogger - Pode ser metadados completo ou logData
 */
export function createLogger(dadosLogger) {
  const all = getAllErrors();
  const now = new Date();
  const dataHora = now.toLocaleString("pt-BR");
  const blocos = [];
  if (Array.isArray(all.infos) && all.infos.length > 0) {
    blocos.push(
      "🟩 Informações:\n" + all.infos.map((i) => `ℹ️ ${i}`).join("\n")
    );
  }
  if (Array.isArray(all.avisos) && all.avisos.length > 0) {
    blocos.push("🟨 Avisos:\n" + all.avisos.map((a) => `⚠️ ${a}`).join("\n"));
  }

  if (Array.isArray(all.erros) && all.erros.length > 0) {
    blocos.push("🟥 Erros:\n" + all.erros.map((e) => `❌ ${e}`).join("\n"));
  }

  const blocoMensagens =
    blocos.length > 0 ? blocos.join("\n\n") : "✅ Nenhuma mensagem registrada.";

  const acao = dadosLogger.acao?.toLowerCase?.() ?? "deleted"; // fallback para 'deleted' se não vier

  const titulo =
    acao === "deleted"
      ? `==== LOG EXCLUSÃO ${dadosLogger.nome_arquivo} - ${dataHora} ====`
      : `==== LOG ${dadosLogger.nome_arquivo} - ${dataHora} ====`;

  const corpoBase = [
    `==============================================================`,
    titulo,
    `Arquivo: ${dadosLogger.nome_arquivo}`,
    `Evento/Ação: ${acao}`,
    `Tabela: ${dadosLogger.tabela ?? dadosLogger.tabela_destino}`,
    `Ano: ${dadosLogger.ano} | Mês: ${dadosLogger.mes}`,
    `hash: ${dadosLogger.hash ?? dadosLogger.hash_arquivo ?? "—"}`,
    `Coluna de referencia: ${dadosLogger.coluna_data ?? "—"}`,
    `=============== Resultados da operação ===============`,
    blocoMensagens,
  ];

  if (
    acao !== "deleted" &&
    dadosLogger.colunas_json &&
    dadosLogger.colunas_tabela
  ) {
    corpoBase.push(
      `Colunas JSON: ${Object.keys(dadosLogger.colunas_json).join(", ")}`,
      `Colunas Tabela: ${Object.keys(dadosLogger.colunas_tabela).join(", ")}`
    );

    const colunasValidas = colunsValidator(
      dadosLogger.colunas_json,
      dataLogger.colunas_tabela
    );
    corpoBase.push(`${colunasValidas}`);
  }
  corpoBase.push(
    `==============================================================`
  );

  return corpoBase.join("\n\n");
}

/**
 * Escreve o logger dinamicamente baseado no tipo de ação
 * @param {Object} dadosLogger - Objeto genérico com informações mínimas
 */
export default async function loggerMaster(dadosLogger) {
  const texto = createLogger(dadosLogger);

  let logPath;
  if (!dadosLogger?.caminho_original) {
    console.warn(
      "⚠️ caminho_original indefinido! Salvando em fallback_logger.txt"
    );
    logPath = path.resolve(__dirname, "../cache/fallback_logger.txt");
  } else {
    logPath = path.join(
      path.dirname(dadosLogger.caminho_original),
      "logger.txt"
    );
  }

  try {
    await fs.appendFile(logPath, texto + "\n", "utf8");
    console.log(`📝 Logger salvo com sucesso em: ${logPath}`);
  } catch (e) {
    addErro(`Erro ao escrever o log em: ${logPath}, erro: ${e.message}`);
    throw e;
  }

  sendLoggerToConsole(dadosLogger);
  clearAllErrors();
}

export function sendLoggerToConsole(dadosLogger) {
  const texto = createLogger(dadosLogger);
  console.log(texto);
}
