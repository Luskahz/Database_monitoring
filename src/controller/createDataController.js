import path from "path";
import { analyzeCsv } from "../utils/csvStream.js";
import { addAviso, addErro } from "../middleware/errorHandler.js";

export default async function createDataController(filePath, action) {
  const contexto = filePath;

  try {
    const { metadados, logData } = await createFundamentalDocsController(
      filePath,
      action,
      contexto
    );

    if (!metadados || metadados.total_linhas === 0) {
      addAviso("CSV vazio, validar se está válido", contexto);
      return null;
    }
    return { metadados, logData };
  } catch (e) {
    addErro(`Erro ao gerar metadados e logData: ${e.message}`, contexto);
    throw e;
  }
}

export async function createMetadadosController(filePath, action) {
  const destino = destinoByFilePath(filePath);
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
  };
}

export function truncarFilepath(fullpath) {
  const marcador = "Diretórios_SQL";
  const idx = fullpath.indexOf(marcador);
  if (idx === -1) return fullpath; // fallback: não achou
  return fullpath.slice(idx).replace(/\\\\/g, "\\");
}

export function createLogDataController(metadados) {
  return {
    tabela_destino: metadados.tabela,
    nome_arquivo: metadados.nome_arquivo,
    ano: parseInt(metadados.ano),
    mes: metadados.mes,
    dia: metadados.dia,
    coluna_data: metadados.coluna_data,
    data_upload: new Date(),
    hash_arquivo: metadados.hash,
    caminho_original: truncarFilepath(metadados.caminho_original), // <- truncado aqui
    sucesso: true,
    mensagem_erro: null,
  };
}
export async function createFundamentalDocsController(
  filePath,
  action,
  contexto
) {
  try {
    const metadados = await createMetadadosController(filePath, action);
    const logData = createLogDataController(metadados);
    return { metadados, logData };
  } catch (e) {
    addErro(
      `Erro ao gerar os objetos fundamentais, metadados e logdata, erro: ${e.message}`,
      contexto
    );
    throw e;
  }
}

export function destinoByFilePath(filePath) {
  const fileName = path.basename(filePath);
  const parent = path.dirname(filePath);
  const grandParent = path.dirname(parent);
  const greatGrandParent = path.dirname(grandParent);

  const baseNameNoExt = path.basename(fileName, path.extname(fileName));
  if (/^\d+$/.test(baseNameNoExt)) {
    // Exemplo: .../2025/julho/1.csv
    return {
      nome_arquivo: fileName.toLocaleLowerCase(), //1.csv
      ano: path.basename(grandParent).toLocaleLowerCase(), // "2025"
      mes: path.basename(parent).toLocaleLowerCase(), // "julho"
      dia: path.basename(fileName, path.extname(fileName)).toLocaleLowerCase(), //1
      tabela_destino: path.basename(greatGrandParent).toLocaleLowerCase(), // "base_bees_deliver_dia"
    };
  } else {
    // Exemplo: .../2025/julho.csv
    return {
      nome_arquivo: fileName.toLocaleLowerCase(), //julho.csv
      ano: path.basename(parent).toLocaleLowerCase(), // "2025"
      mes: path.basename(fileName, path.extname(fileName)).toLocaleLowerCase(), // "julho"
      dia: null,
      tabela_destino: path.basename(grandParent).toLocaleLowerCase(), // "base_bees_deliver_dia"
    };
  }
}
