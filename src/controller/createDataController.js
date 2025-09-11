import path from "path";
import { stat } from "fs/promises";
import {
  analyzeCsv,
  readCsvHeader,
  normalizeHeadersOnce,
} from "../utils/csvStream.js";
import { addAviso, addErro } from "../middleware/errorHandler.js";
import {
  detectEncoding,
  detectDelimiter,
} from "../utils/prepareStreamByFilepath.js";
import {
  getColumnsFromTable,
  getTiposFromTable,
  getDateColumnsFromTable,
} from "../model/tableModel.js";
import { PIPELINE_FAST_PATH } from "../../config/index.js";

/* ---------- hot helpers ---------- */
function isAllDigits(s) {
  if (!s) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}
function tailDirs(dir) {
  let i1 = dir.lastIndexOf(path.sep);
  const parent = i1 === -1 ? dir : dir.slice(i1 + 1);

  const dir2 = i1 === -1 ? "" : dir.slice(0, i1);
  let i2 = dir2.lastIndexOf(path.sep);
  const grandParent = i2 === -1 ? dir2 : dir2.slice(i2 + 1);

  const dir3 = i2 === -1 ? "" : dir2.slice(0, i2);
  let i3 = dir3.lastIndexOf(path.sep);
  const greatGrandParent = i3 === -1 ? dir3 : dir3.slice(i3 + 1);

  return [parent, grandParent, greatGrandParent];
}
export function destinoByFilePath(filePath) {
  const { dir, base: fileName, name: baseNameNoExt } = path.parse(filePath);
  const [parent, grandParent, greatGrandParent] = tailDirs(dir);
  const fileNameLC = fileName.toLowerCase();

  if (isAllDigits(baseNameNoExt)) {
    return {
      nome_arquivo: fileNameLC,
      ano: grandParent.toLowerCase(),
      mes: parent.toLowerCase(),
      dia: baseNameNoExt.toLowerCase(),
      tabela_destino: greatGrandParent.toLowerCase(),
    };
  }
  return {
    nome_arquivo: fileNameLC,
    ano: parent.toLowerCase(),
    mes: baseNameNoExt.toLowerCase(),
    dia: null,
    tabela_destino: grandParent.toLowerCase(),
  };
}
export function truncarFilepath(fullpath) {
  const marcador = "Diretórios_SQL";
  const idx = fullpath.indexOf(marcador);
  if (idx < 0) return fullpath;

  // fatia direto
  let s = fullpath.slice(idx);

  // substitui \\ por \ sem regex
  if (s.indexOf("\\\\") !== -1) {
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === "\\" && s[i + 1] === "\\") {
        // pula um
        continue;
      }
      out += c;
    }
    s = out;
  }

  return s;
}

/* ---------- controllers ---------- */

export default async function createDataController(filePath, action) {
  return createFundamentalDocsController(filePath, action, filePath)
    .then((result) => {
      const m = result?.metadados;
      if (!m) {
        addErro("Falha ao gerar metadados do CSV.", filePath);
        return null;
      }
      if (m.total_linhas === 0) {
        addAviso(
          "CSV sem registros (apenas cabeçalho ou vazio). Prosseguindo no FAST_PATH.",
          filePath
        );
      }
      return result;
    })
    .catch((e) => {
      addErro("Erro ao gerar metadados e logData: " + e.message, filePath);
      throw e;
    });
}

export async function createFundamentalDocsController(
  filePath,
  action,
  contexto
) {
  try {
    const metadados = await createMetadadosController(filePath, action);
    const { size } = await stat(filePath);
    metadados.file_size_bytes = size;
    // total_linhas já preenchido em createMetadadosController
    const logData = createLogDataController(metadados, null);
    logData.file_size_bytes = metadados.file_size_bytes;
    logData.total_linhas = metadados.total_linhas;
    return { metadados, logData };
  } catch (e) {
    addErro(
      "Erro ao gerar os objetos fundamentais, metadados e logdata, erro: " +
        e.message,
      contexto
    );
    throw e;
  }
}

export async function createMetadadosController(filePath, action) {
  const destino = destinoByFilePath(filePath);
  const caminho_truncado = truncarFilepath(filePath);

  if (PIPELINE_FAST_PATH) {
    const { encoding } = await detectEncoding(filePath, {
      headBytes: 64 * 1024,
      fallback: "latin1",
    });
    const delimiter = await detectDelimiter(filePath, encoding, {
      minHeadBytes: 64 * 1024,
      maxHeadBytes: 64 * 1024,
    });
    const rawHeaders = await readCsvHeader(filePath, encoding, delimiter, {
      highWaterMark: 64 * 1024,
      fastMode: true,
    });
    const { headers: headersNorm } = normalizeHeadersOnce(rawHeaders);
    const [colunasTabela, tiposEsperados, colunaData] = await Promise.all([
      getColumnsFromTable(destino.tabela_destino),
      getTiposFromTable(destino.tabela_destino),
      getDateColumnsFromTable(destino.tabela_destino),
    ]);

    return {
      nome_arquivo: destino.nome_arquivo,
      ano: destino.ano,
      mes: destino.mes,
      dia: destino.dia,
      tabela: destino.tabela_destino,

      hash: null,
      encoding,
      delimiter,
      coluna_data: colunaData,
      acao: action,
      colunas_tabela: colunasTabela,
      colunas_json: headersNorm,
      tipos_esperados: tiposEsperados,
      datas_csv: null,
      total_linhas: -1,

      caminho_original: filePath,
      caminho_truncado,
    };
  }

  const analise = await analyzeCsv(filePath, destino.tabela_destino);

  return {
    nome_arquivo: destino.nome_arquivo,
    ano: destino.ano,
    mes: destino.mes,
    dia: destino.dia,
    tabela: destino.tabela_destino,

    hash: analise.hash,
    encoding: analise.encoding,
    delimiter: analise.delimiter,
    coluna_data: analise.coluna_data,
    acao: action,
    colunas_tabela: analise.colunas_tabela,
    colunas_json: analise.colunas_json,
    tipos_esperados: analise.tipos_esperados,
    datas_csv: analise.datas_csv,
    total_linhas: analise.total_linhas,

    caminho_original: filePath,
    caminho_truncado,
  };
}

export function createLogDataController(m, now) {
  const anoNum = typeof m.ano === "number" ? m.ano : +m.ano;

  return {
    tabela_destino: m.tabela,
    nome_arquivo: m.nome_arquivo,
    ano: anoNum,
    mes: m.mes,
    dia: m.dia ?? null,
    coluna_data: m.coluna_data,
    data_upload: now || new Date(), // reuse se vier de fora
    hash_arquivo: m.hash,
    file_size_bytes: m.file_size_bytes ?? null,
    total_linhas: m.total_linhas ?? null,
    caminho_original: m.caminho_truncado || truncarFilepath(m.caminho_original),
    sucesso: true,
    mensagem_erro: null,
  };
}
