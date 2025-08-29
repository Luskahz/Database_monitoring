import { addAviso } from "../middleware/errorHandler.js";
import { getLoggerContext, updateLoggerController } from "../middleware/logger.js";

/**
 * @param {Array} list  // pode ser array de objetos (coluna_data) OU array de strings (YYYY-MM-DD)
 * @param {object} metadados
 */
export async function insertValidator(list, metadados) {
  const contexto = metadados.caminho_original;

  // Sem coluna de data -> cadastro "cego"
  if (list === null) return "cadastro";

  const datasCsv = Array.isArray(metadados.datas_csv) ? metadados.datas_csv : [];
  if (datasCsv.length === 0) {
    addAviso("[Controller insersão] CSV sem dados válidos para coluna de data.", contexto);
    void updateLoggerController(getLoggerContext(metadados, {}, contexto), contexto);
    return null;
  }

  // CSV já vem normalizado (analyzeCsv): 'YYYY-MM-DD'
  const setCsv = new Set(datasCsv);
  const col = metadados.coluna_data;

  // Caminho rápido: se list já veio como array de strings 'YYYY-MM-DD'
  if (list.length && typeof list[0] === "string") {
    for (let i = 0; i < list.length; i++) {
      const d = list[i].length >= 10 ? list[i].slice(0, 10) : null;
      if (d && setCsv.has(d)) {
        addAviso(
          "[Controller insersão] Conflito detectado: datas do CSV já existem na base. Os dados serão reprocessados.",
          contexto
        );
        void updateLoggerController(metadados, contexto);
        return "substituir";
      }
    }
    return "inserir";
  }

  // Caminho genérico: list é array de objetos com a coluna de data
  for (let i = 0; i < list.length; i++) {
    const raw = list[i]?.[col];
    let d = null;

    // Evita new Date() quando possível
    if (raw instanceof Date) {
      d = raw.toISOString().slice(0, 10);
    } else if (typeof raw === "string") {
      // espera 'YYYY-MM-DD...' vindo do banco; pega só o prefixo de 10
      d = raw.length >= 10 ? raw.slice(0, 10) : null;
    }

    if (d && setCsv.has(d)) {
      addAviso(
        "[Controller insersão] Conflito detectado: datas do CSV já existem na base. Os dados serão reprocessados.",
        contexto
      );
      void updateLoggerController(metadados, contexto);
      return "substituir";
    }
  }

  return "inserir";
}

