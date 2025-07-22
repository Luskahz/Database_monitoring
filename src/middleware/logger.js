import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getAllErrors, clearAllErrors } from "./errorHandler.js";
import colunsValidator from "../utils/colunsValidator.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function TextoLogger(dadosLogger) {
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
    blocos.length > 0 ? blocos.join("\n\n") : "✅ Sem mensagens loggadas...";

  const acao = dadosLogger.acao?.toLowerCase?.() ?? "created";

  const titulo =
    acao === "deleted"
      ? `==== LOG DELETED ${dadosLogger.nome_arquivo} - ${dataHora} ====`
      : `==== LOG CREATED ${dadosLogger.nome_arquivo} - ${dataHora} ====`;

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
      `Colunas JSON: ${dadosLogger.colunas_json.join(", ")}`,
      `Colunas Tabela: ${dadosLogger.colunas_tabela.join(", ")}`
    );

    const colunasValidas = colunsValidator(
      dadosLogger.colunas_json,
      dadosLogger.colunas_tabela
    );
    corpoBase.push(`${colunasValidas}`);
  }
  corpoBase.push(
    `==============================================================`
  );

  return corpoBase.join("\n\n");
}

function getLoggerFileName(dir) {
  return path.join(dir, `Logger.txt`);
}

export async function loggerFileInit(filePath) {
  const dir = path.dirname(filePath);
  const logPath = getLoggerFileName(dir);

  try {
    await fs.access(logPath);
    return logPath;
  } catch (e) {
    try {
      await fs.writeFile(logPath, "logger criado...", "utf8");
      return logPath;
    } catch (erro) {
      console.log(
        "[Logger] Erro na criação do logger antes de rodar o handler: " +
          erro.message
      );
    }
  }
}

export async function createLoggerController(filePath) {
  const dir = path.dirname(filePath);
  const logPath = getLoggerFileName(dir);
  try {
    await fs.writeFile(logPath, "Processo iniciado....", "utf8");
  } catch (e) {
    console.log(
      "[Logger] erro ao iniciar o processo de log, arquivo criado porem erro na interação inicial"
    );
  }
}

export async function updateLoggerController(dadosLogger) {
  let filePath, dadosParaLog;

  if (typeof dadosLogger === "string") {
    filePath = dadosLogger;
    dadosParaLog = {
      nome_arquivo: path.basename(filePath),
      acao: "erro",
      tabela: "—",
      tabela_destino: "—",
      ano: "—",
      mes: "—",
      hash: "—",
      coluna_data: "—",
      caminho_original: filePath,
    };
  } else {
    filePath = dadosLogger?.caminho_original || dadosLogger?.filePath;
    dadosParaLog = dadosLogger;
  }

  const dir = path.dirname(filePath);
  const logPath = getLoggerFileName(dir);

  const texto = TextoLogger(dadosParaLog);
  try {
    await fs.writeFile(logPath, texto, "utf8");
  } catch (e) {
    console.log(
      "[Logger] Erro ao atualizar o logger, erro na insersão das atualizações do processo"
    );
  }
}

export async function finalLoggerController(dadosLogger) {
  let filePath, dadosParaLog;

  if (typeof dadosLogger === "string") {
    filePath = dadosLogger;
    dadosParaLog = {
      nome_arquivo: path.basename(filePath),
      acao: "erro",
      tabela: "—",
      tabela_destino: "—",
      ano: "—",
      mes: "—",
      hash: "—",
      coluna_data: "—",
      caminho_original: filePath,
    };
  } else {
    filePath = dadosLogger?.caminho_original || dadosLogger?.filePath;
    dadosParaLog = dadosLogger;
  }

  const dir = path.dirname(filePath);
  const logPath = getLoggerFileName(dir);

  const texto = TextoLogger(dadosParaLog);
  try {
    await fs.writeFile(logPath, texto, "utf8");
  } catch (e) {
    console.log(
      "[Logger] Erro ao atualizar o logger, erro na finalização, validar chamada no handler"
    );
  }

  clearAllErrors();
  console.log(texto);
}

export async function errorLoggerController(dadosLogger) {
  const texto = TextoLogger(dadosLogger);
  let file;
  try {
    file = await loggerFileInit(dadosLogger);
  } catch (e) {
    console.warn(e.message);
  }

  if (file) {
    try {
      await fs.writeFile(file, texto, "utf8");
    } catch (e) {
      console.log(
        "[Logger] Erro ao atualizar o logger, erro na finalização, validar chamada no handler"
      );
    }
  }
  clearAllErrors();
  console.log(texto);
}
