import path from "path";
import { analyzeCsv } from "../utils/csvStream.js";
import { addAviso, addErro } from "../middleware/errorHandler.js";



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
      if (!m || m.total_linhas === 0) { addAviso("CSV vazio, validar se está válido", filePath); return null; }
      return result; // evita alocar novo { metadados, logData }
    })
    .catch((e) => { addErro("Erro ao gerar metadados e logData: " + e.message, filePath); throw e; });
}

export async function createFundamentalDocsController(filePath, action, contexto) {
  return createMetadadosController(filePath, action)
    .then((metadados) => {
      const logData = createLogDataController(metadados, /*now*/ null);
      return { metadados, logData };
    })
    .catch((e) => { addErro("Erro ao gerar os objetos fundamentais, metadados e logdata, erro: " + e.message, contexto ); throw e; });
}

export async function createMetadadosController(filePath, action) {
  const destino = destinoByFilePath(filePath);
  const analise = await analyzeCsv(filePath, destino.tabela_destino);
  const caminho_truncado = truncarFilepath(filePath);

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
    caminho_truncado, // evita recalcular no log
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
    caminho_original: m.caminho_truncado || truncarFilepath(m.caminho_original),
    sucesso: true,
    mensagem_erro: null,
  };
}







