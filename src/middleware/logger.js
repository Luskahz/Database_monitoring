import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getAllErrors, clearAllErrors, addErro } from "./errorHandler.js";
import colunsValidator from "../utils/colunsValidator.js";
import { safeLog } from "../utils/progressBar.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function TextoLogger(dadosLogger, contexto = "__global") {
  const all = getAllErrors(contexto);
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
    `Ano: ${dadosLogger.ano} | Mês: ${dadosLogger.mes} | Dia: ${dadosLogger.dia}`,
    `hash: ${dadosLogger.hash ?? dadosLogger.hash_arquivo ?? "—"}`,
    `Coluna de referencia: ${dadosLogger.coluna_data ?? "—"}`,
    `=================== Resultados da operação ===================`,
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

async function getLoggerFileName(dir, name) {
  let currentDir = dir;
  const filename = `Logger_${name}.txt`;

  while (true) {
    const loggerDir = path.join(currentDir, "loggers");
    try {
      await fs.mkdir(loggerDir, { recursive: false });
      return path.join(loggerDir, filename);
    } catch (err) {
      // Se falhou por outro motivo que não é "pasta não existente", lança
      if (err.code !== "ENOENT") throw err;

      // Sobe um nível
      const parent = path.dirname(currentDir);
      if (parent === currentDir) {
        // Chegou na raiz do sistema
        throw new Error("Não foi possível encontrar um diretório válido para salvar o log.");
      }
      currentDir = parent;
    }
  }
}

export async function createLoggerController(filePath) {
  const dir = path.dirname(filePath);
  const { name } = path.parse(filePath);
  const logPath = getLoggerFileName(dir, name);

  try {
    // Garante que a pasta 'loggers' exista
    await fs.mkdir(path.dirname(logPath), { recursive: true });

    await fs.writeFile(logPath, "Processo iniciado....", "utf8");
  } catch (e) {
    console.log(
      "[Logger] erro ao iniciar o processo de log, arquivo criado porém erro na interação inicial"
    );
  }
}

export async function updateLoggerController(
  dadosLogger,
  contexto = "__global"
) {
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
      dia: "_",
      hash: "—",
      coluna_data: "—",
      caminho_original: filePath,
    };
  } else {
    filePath = dadosLogger?.caminho_original || dadosLogger?.filePath;
    dadosParaLog = dadosLogger;
  }
  const { name } = path.parse(filePath);
  const dir = path.dirname(filePath);
  const logPath = getLoggerFileName(dir, name);

  const texto = TextoLogger(dadosParaLog, contexto);
  try {
    await fs.writeFile(logPath, texto, "utf8");
  } catch (e) {
    console.log(
      "[Logger] Erro ao atualizar o logger, erro na insersão das atualizações do processo"
    );
  }
}

export async function finalLoggerController(
  dadosLogger,
  contexto = "__global"
) {
  let filePath, dadosParaLog;

  if (typeof dadosLogger === "string") {
    filePath = dadosLogger;
    dadosParaLog = {
      nome_arquivo: path.basename(filePath),
      acao: "_",
      tabela: "—",
      tabela_destino: "—",
      ano: "—",
      mes: "—",
      dia: "_",
      hash: "—",
      coluna_data: "—",
      caminho_original: filePath,
    };
  } else {
    filePath = dadosLogger?.caminho_original || dadosLogger?.filePath;
    dadosParaLog = dadosLogger;
  }
  const { name } = path.parse(filePath);
  const dir = path.dirname(filePath);
  const logPath = getLoggerFileName(dir, name);
  let texto;
  try {
    texto = TextoLogger(dadosParaLog, contexto);
    await fs.writeFile(logPath, texto, "utf8");
  } catch (e) {
    try {
      addErro(
        `[logger] Erro ao montar ou salvar log: ${e.message}\n${e.stack}`,
        contexto
      );
    } catch {
      // Fallback simples: imprimir direto no console, sem usar addErro
      console.error(
        `[logger] FALHA CRÍTICA no logger: ${e.message}\n${e.stack}`
      );
    }
  }
}

export async function errorLoggerController(
  dadosLogger,
  contexto = "__global"
) {
  const texto = TextoLogger(dadosLogger, contexto);
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
  clearAllErrors(contexto);

  safeLog(texto);
}

export function getLoggerContext(metadados = {}, logData = {}, filePath) {
  return {
    ...metadados,
    ...logData,
    caminho_original: filePath ?? "—",
  };
}
