import path from "path";
import { stat } from "fs/promises";
import {
  analyzeCsv,
  readCsvHeader,
  normalizeHeadersOnce,
} from "../utils/csvStream.js";
import iconv from "iconv-lite";
import { addAviso, addErro, addInfo } from "../middleware/errorHandler.js";
import {
  detectEncoding,
  detectDelimiter,
} from "../utils/prepareStreamByFilepath.js";
import { readHeadOnce } from "../utils/readHeadOnce.js";
import {
  getColumnsFromTable,
  getTiposFromTable,
  getDateColumnsFromTable,
  buildRangeFromMetadados,
} from "../model/tableModel.js";
import { PIPELINE_FAST_PATH } from "../../config/index.js";
import { decideOverlapPolicy } from "../utils/decideOverlapPolicy.js";
import { logActivity, writeHeadersDiff, shortPath } from "../middleware/logger.js";
import { isRemotePath } from "../utils/ensureLocalStaging.js";

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

function inferTabelaFromContexto(contexto, fallback = "—") {
  if (!contexto) return fallback;
  const match = String(contexto).match(/[\\/](\d{2}_\d{2}_\d{2})[\\/](\d{4})[\\/][^\\/]+$/);
  if (match && match[1]) {
    return match[1];
  }
  return fallback;
}

function computeHeadersDiff(headersCsv, headersTabela) {
  const csv = Array.isArray(headersCsv) ? headersCsv : [];
  const tabela = Array.isArray(headersTabela) ? headersTabela : [];
  const tabelaSet = new Set(tabela.map((h) => String(h ?? "")));
  const csvSet = new Set(csv.map((h) => String(h ?? "")));
  const extras = csv.map((h) => String(h ?? "")).filter((h) => !tabelaSet.has(h));
  const missing = tabela.map((h) => String(h ?? "")).filter((h) => !csvSet.has(h));
  return { extras, missing };
}

async function logHeadersComparison({ contexto, tabela, headersCsv, headersTabela }) {
  if (!Array.isArray(headersCsv) || !Array.isArray(headersTabela)) return;
  const tabelaSafe = tabela || inferTabelaFromContexto(contexto);
  try {
    await writeHeadersDiff({
      filePath: contexto,
      tabela: tabelaSafe || inferTabelaFromContexto(contexto),
      headersCsv,
      headersTabela,
    });

    const { extras, missing } = computeHeadersDiff(headersCsv, headersTabela);
    if (extras.length === 0 && missing.length === 0) {
      addInfo("[Headers] CSV e tabela estão alinhados.", contexto);
    }
  } catch (err) {
    const shortCtx = shortPath(contexto || "");
    addAviso(
      `[Headers] não foi possível gerar comparativo (${shortCtx || "—"}): ${
        err?.message || err
      }`,
      contexto,
    );
  }
}

/* ---------- controllers ---------- */

export default async function createDataController(filePath, action, opts = {}) {
  const workFilePath =
    opts && typeof opts.workFilePath === "string" ? opts.workFilePath : filePath;
  return createFundamentalDocsController(filePath, action, filePath, {
    workFilePath,
    stagingInfo: opts?.stagingInfo ?? null,
  })
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
  contexto,
  opts = {}
) {
  try {
    const workFilePath =
      opts && typeof opts.workFilePath === "string" ? opts.workFilePath : filePath;
    const metadados = await createMetadadosController(filePath, action, opts);
    const { size } = await stat(workFilePath);
    metadados.file_size_bytes = size;
    // total_linhas já preenchido em createMetadadosController
    const logData = createLogDataController(metadados, null);
    logData.file_size_bytes = metadados.file_size_bytes;
    logData.total_linhas = metadados.total_linhas;

    const stagingInfo = opts?.stagingInfo ?? null;
    const isRemoteSource = stagingInfo?.isRemote ?? isRemotePath(filePath);
    const copiedNow = Boolean(stagingInfo?.copied);
    const reusedCopy = Boolean(stagingInfo?.reused);
    const existingPaths =
      metadados.paths && typeof metadados.paths === "object" ? metadados.paths : {};
    metadados.paths = {
      ...existingPaths,
      source: existingPaths.source || filePath,
      work: workFilePath,
      isRemoteSource,
      copiedToLocal: Boolean(copiedNow || reusedCopy),
      copiedNow,
      reusedLocalCopy: reusedCopy,
      stagingDir: stagingInfo?.stagingDir ?? existingPaths.stagingDir ?? null,
    };
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

export async function createMetadadosController(filePath, action, opts = {}) {
  const destino = destinoByFilePath(filePath);
  const caminho_truncado = truncarFilepath(filePath);
  const workFilePath =
    opts && typeof opts.workFilePath === "string" ? opts.workFilePath : filePath;

  if (PIPELINE_FAST_PATH) {
    const { headBuf } = await readHeadOnce(workFilePath, 64 * 1024);
    const headSampleBytes = headBuf?.length ?? 0;
    let { encoding } = await detectEncoding(
      { filePath: workFilePath, headBuf, sampleBytes: headSampleBytes, fallback: "latin1" }
    );

    let encodingNorm = typeof encoding === "string" ? encoding.toLowerCase() : "utf8";
    if (encodingNorm !== "latin1" && encodingNorm !== "utf8") {
      encodingNorm = "utf8";
    }
    encoding = encodingNorm;

    let headForText = headBuf ?? Buffer.alloc(0);
    if (encodingNorm === "utf8" && headForText.length >= 3) {
      if (headForText[0] === 0xef && headForText[1] === 0xbb && headForText[2] === 0xbf) {
        headForText = headForText.subarray(3);
      }
    }

    const headText =
      encodingNorm === "latin1"
        ? iconv.decode(headForText, "latin1")
        : headForText.toString("utf8");

    const delimiter = await detectDelimiter(workFilePath, encoding, {
      minHeadBytes: headSampleBytes,
      maxHeadBytes: headSampleBytes,
      headText,
      headBytes: headSampleBytes,
    });
    const rawHeaders = await readCsvHeader(workFilePath, encoding, delimiter, {
      highWaterMark: 64 * 1024,
      fastMode: true,
    });
    const { headers: headersNorm } = normalizeHeadersOnce(rawHeaders);
    const [colunasTabela, tiposEsperados, colunaData] = await Promise.all([
      getColumnsFromTable(destino.tabela_destino),
      getTiposFromTable(destino.tabela_destino),
      getDateColumnsFromTable(destino.tabela_destino),
    ]);

    const metadados = {
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

    await logHeadersComparison({
      contexto: filePath,
      tabela: metadados.tabela,
      headersCsv: metadados.colunas_json,
      headersTabela: metadados.colunas_tabela,
    });

    await ensureOverlapMetadata(metadados, filePath, action);
    return metadados;
  }

  const analise = await analyzeCsv(workFilePath, destino.tabela_destino);

  const metadados = {
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

  await logHeadersComparison({
    contexto: filePath,
    tabela: metadados.tabela,
    headersCsv: metadados.colunas_json,
    headersTabela: metadados.colunas_tabela,
  });

  await ensureOverlapMetadata(metadados, filePath, action);
  return metadados;
}

async function ensureOverlapMetadata(metadados, contexto, action) {
  if (!metadados) return null;
  if (metadados.overlap) {
    if (!metadados.range) {
      metadados.range = buildRangeFromMetadados(metadados);
    }
    return metadados.overlap;
  }

  const range = metadados.range ?? buildRangeFromMetadados(metadados);
  metadados.range = range || null;

  const logger = createOverlapLogger(contexto, action);
  const decision = await decideOverlapPolicy({
    table: metadados.tabela,
    dateCol: metadados.coluna_data,
    range,
    logger,
  });
  metadados.overlap = decision;
  return decision;
}

function createOverlapLogger(contexto, action) {
  return {
    info(message, payload = {}) {
      try {
        const serialized = JSON.stringify(payload);
        const line = `${message} ${serialized}`;
        addInfo(line, contexto);
        void logActivity("info", line, { filePath: contexto, action });
      } catch (err) {
        addInfo(`${message} ${payload ? String(payload) : ""}`, contexto);
        void logActivity("info", message, { filePath: contexto, action });
      }
    },
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
