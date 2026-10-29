import { addAviso, addErro } from "../../middleware/errorHandler.js";
import { deleteLogByHash, getLogWithFilePath } from "../../model/logModel.js";
import { destinoByFilePath } from "../createDataController.js";
import { managerDeleterController } from "../managerDataController.js";
import { withFileLifecycle } from "../../utils/withFileLifecycle.js";

export default async function deletedHandler(filePath, acao, job) {
  await withFileLifecycle(filePath, async () => {
    try {
      const destino = destinoByFilePath(filePath);
      const logData = await getLogWithFilePath(filePath);
      if (!logData) throw new Error(`Nenhum registro de log encontrado para ${filePath}; exclusão bloqueada.`);
      if (!logData.sucesso) throw new Error("Exclusão bloqueada: a carga deste arquivo falhou ou seu período já foi substituído.");
      if (destino.periodicidade === "anual" && (!logData.sucesso || logData.mes !== "anual" ||
          logData.tabela_destino !== destino.tabela_destino || String(logData.ano) !== destino.ano ||
          logData.nome_arquivo !== destino.nome_arquivo)) {
        throw new Error("[Anual] Exclusão bloqueada: log não comprova uma carga anual bem-sucedida deste arquivo.");
      }
      logData.caminho_original = filePath;
      if (acao) logData.acao = acao;
      addAviso("Lógica de exclusão dos dados iniciada...", filePath);
      const resultado = await managerDeleterController(logData);
      if (resultado?.erro) throw new Error(resultado.mensagem || "Erro durante exclusão.");
      if (logData.mes !== "anual") await deleteLogByHash(logData);
      addAviso("Lógica de exclusão dos dados finalizada...", filePath);
    } catch (error) {
      addErro(`Erro no deletedHandler: ${error.message}`, filePath);
      throw error;
    }
  }, { job, action: acao });
}
