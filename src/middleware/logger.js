import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));




export async function errorReceiver(error) {
  
}

/**
 * @param {{
 *   nome_arquivo: string,
 *   tabela: string,
 *   ano: string,
 *   mes: string,
 *   acao: string,
 *   caminho_arquivo: string
 * }} metadados
 * @param {string[] | string} mensagens
 */
export default async function loggerMaster(metadados, mensagens) {
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
      `Coluna de referencia: ${coluna_data}`,
      `=============== Orientações referente a ação ===============`,
      ...(Array.isArray(mensagens) ? mensagens : [mensagens]),
      `==============================================================`,
    ].join("\n\n");

    const pasta = path.dirname(metadados.caminho_arquivo);
    const logPath = path.join(pasta, "logger.txt");

    await fs.appendFile(logPath, texto + "\n", "utf8");
    console.log(texto);
  } catch (error) {
    console.log(`Erro ao gerar log, erro: ${error}`);
    throw error;
  }
}
