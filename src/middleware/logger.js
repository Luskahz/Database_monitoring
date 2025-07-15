import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getAllErrors, clearAllErrors} from "./errorHandler.js"
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @param {{
 *   nome_arquivo: string,
 *   tabela: string,
 *   ano: string,
 *   mes: string,
 *   acao: string,
 *   caminho_arquivo: string,
 *   coluna_data: date
 * }} metadados
 * @param {string[] | string} mensagens
 */
export default async function loggerMaster(metadados) {
  const errorsMessages = getAllErrors()
  try {
    const now = new Date();
    const dataHora = now.toLocaleString("pt-BR");

    const texto = [
      `==============================================================`,
      `==== LOG ${metadados.nome_arquivo} - ${dataHora} ====`,
      `Arquivo: ${metadados.nome_arquivo}`,
      `Evento/Ação: ${metadados.acao}`,
      `Tabela: ${metadados.tabela}`,
      `Ano: ${metadados.ano} | Mês: ${metadados.mes}`,
      `hash: ${metadados.hash}`,
      `Coluna de referencia: ${metadados.coluna_data}`,
      `=============== Orientações referente a ação ===============`,
      ...(errorsMessages.map(m => "⚠️ " + m))
      `==============================================================`,
    ].join("\n\n");

    const pasta = path.dirname(metadados.caminho_arquivo);
    const logPath = path.join(pasta, "logger.txt");

    await fs.appendFile(logPath, texto + "\n", "utf8");
    console.log(texto);
    clearAllErrors()
  } catch (error) {
    console.log(`Erro ao gerar log, erro: ${error}`);
    throw error;
  }
}
