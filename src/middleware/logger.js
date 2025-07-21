import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getAllErrors, clearAllErrors } from "./errorHandler.js";
import colunsValidator from "../utils/colunsValidator.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function sendLoggerToConsole(dadosLogger) {
  const texto = createLogger(dadosLogger);
  console.log(texto);
}

export async function loggerFileInit(filePath) {
  let logPath;
  if (!filePath) {
    console.warn(
      "⚠️ caminho_original indefinido nos dados passados para o logger! Salvando na rota fallback, em ../cache/fallback_logger.txt "
    );
    logPath = path.resolve(__dirname, "../cache/fallback_logger.txt");
  } else {
    logPath = path.join(path.dirname(filePath), "iniciando Insersão... .txt");
  }
  try {
    await fs.writeFile(logPath, "Sistema operando...", "utf8");

    return logPath;
  } catch (e) {
    throw new Error("Erro na criação do logger antes de rodar o handler...");
  }
}

async function getLoggerPath(filePath) {
  const caminho = path.dirname(filePath);
  let arquivos;
  try {
    arquivos = await fs.readdir(caminho);
  } catch (e) {
    throw new Error("Erro ao consultar a pasta do arquivo");
  }

  const txts = arquivos.filter((nome) => nome.endsWith(".txt"));

  if (txts.length === 0) return null;

  return path.join(caminho, txts[0]);
}

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

  const acao = dadosLogger.acao?.toLowerCase?.() ?? "deleted"; // fallback para 'deleted' se não vier

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
      `Colunas JSON: ${Object.keys(dadosLogger.colunas_json).join(", ")}`,
      `Colunas Tabela: ${Object.keys(dadosLogger.colunas_tabela).join(", ")}`
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

export async function createLoggerController(dadosLogger) {
  const texto = TextoLogger(dadosLogger);
  let file;
  try {
    file = await loggerFileInit(dadosLogger.caminho_original);
  } catch (e) {
    console.warn(e.message);
  }

  if (file) {
    try {
      await fs.writeFile(file, texto, "utf8");
    } catch (e) {
      console.warn(e.message);
    }
  }
}

export async function updateLoggerController(dadosLogger) {
  const texto = TextoLogger(dadosLogger);
  let file;
  try {
    file = await loggerFileInit(dadosLogger.caminho_original);
  } catch (e) {
    console.warn(e.message);
  }

  const newfile = path.join(path.dirname(file), "finalizando... .txt");
  try {
    if (file) {
      await fs.writeFile(file, texto, "utf8");
      await fs.rename(file, newfile);
    }
  } catch (e) {
    throw new Error(
      "Erro ao atualizar o logger, arquivo criado, porem erro na insersão das atualizações do processo"
    );
  }
}


export async function finalLoggerController(dadosLogger) {
  const texto = TextoLogger(dadosLogger);
  let file;
  try {
    file = await loggerFileInit(dadosLogger?.caminho_original ? dadosLogger : null);
  } catch (e) {
    console.warn(e.message);
  }

  const newfile = path.join(path.dirname(file), "Logger_finalizado.txt");
  try {
    if (file) {
      await fs.writeFile(file, texto, "utf8");
      await fs.rename(file, newfile);
    }
  } catch (e) {
    throw new Error(
      "Erro ao atualizar o logger, arquivo criado, porem erro na finalização, validar chamada no handler"
    );
  }
}

export async function errorLoggerController(dadosLogger) {
  const texto = TextoLogger(dadosLogger);
  let file;
  try {
    file = await loggerFileInit(dadosLogger);
  } catch (e) {
    console.warn(e.message);
  }

  const newfile = path.join(path.dirname(file), "Logger_Error.txt");
  try {
    if (file) {
      await fs.writeFile(file, texto, "utf8");
      await fs.rename(file, newfile);
    }
  } catch (e) {
    throw new Error(
      "Erro ao atualizar o logger, arquivo criado, porem erro na finalização, validar chamada no handler"
    );
  }
  clearAllErrors();
  sendLoggerToConsole(dadosLogger);
}
