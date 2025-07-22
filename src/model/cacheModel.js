import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { addAviso, addInfo } from "../middleware/errorHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const cachePath = path.resolve(__dirname, "../cache", "cacheHash.txt");

async function initCacheFile() {
  const dirPath = path.dirname(cachePath);
  await fs.mkdir(dirPath, { recursive: true });
  try {
    await fs.access(cachePath);
    return cachePath;
  } catch (err) {
    await fs.writeFile(cachePath, "", "utf8");
    console.log("Arquivo de cache criado em:", cachePath);
    return cachePath;
  }
}

export async function insertHashInCache(logData) {
  const { tabela_destino, ano, mes, nome_arquivo } = logData;
  let cachePath;
  try {
    cachePath = await initCacheFile();
  } catch (e) {
    throw new Error(`[model cache] erro ao criar o arquivo do cache: ${e.message}`);
  }

  logData.identificador = `${tabela_destino}_${ano}_${mes}_${nome_arquivo}`;
  const jsonString = JSON.stringify(logData, null, 2);

  try {
    await fs.appendFile(cachePath, jsonString + "\n\n", "utf8");
    addInfo("[model cache] Objeto salvo no cache com sucesso!");
  } catch (e) {
    throw new Error(`erro ao inserir o logData no cache, erro: ${e.message}`);
  }
}

export async function getRegisterFromCache(destino) {
  const { tabela_destino, ano, mes, nome_arquivo } = destino;
  const identificador = `${tabela_destino}_${ano}_${mes}_${nome_arquivo}`;

  let conteudo;
  try {
    conteudo = await fs.readFile(cachePath, "utf8");
  } catch (e) {
    throw new Error(
      `[model cache] Erro ao ler o arquivo no cache, caminho do cache: '${cachePath}' erro: ${e.message}`
    );
  }
  const blocos = conteudo
    .split("\n\n")
    .map((b) => b.trim())
    .filter(Boolean);

  const registros = blocos
    .map((json) => {
      try {
        return JSON.parse(json);
      } catch (e) {
        throw new Error(
          `[model cache] Erro ao fazer parse de um bloco do cache, erro: ${e.message}`
        );
      }
    })
    .filter(Boolean);

  const encontrado = registros.find(
    (reg) => reg.identificador === identificador
  );
  if (!encontrado) {
    throw new Error(
      `[model cache] Nenhum registro encontrado no cache com identificador '${identificador}'`
    );
  }
  return encontrado || null;
}

export async function deleteRegisterFromCache(destino) {
  let registroAlvo;
  try {
    registroAlvo = await getRegisterFromCache(destino);
  } catch (e) {
    throw new Error(
      `[model cache] Erro ao coletar os registros do cache, erro: ${e.message}`
    );
  }

  if (!registroAlvo) {
    throw new Error(
      " [model cache] Registro não encontrado no cache. Nada foi removido."
    );
  }
  let conteudo;
  try {
    conteudo = await fs.readFile(cachePath, "utf8");
  } catch (e) {
    throw new Error(`[model cache] Erro ao ler o cache ${e.message}`);
  }

  const blocos = conteudo
    .split("\n\n")
    .map((b) => b.trim())
    .filter(Boolean);

  const blocosMantidos = blocos.filter((bloco) => {
    try {
      const obj = JSON.parse(bloco);
      return obj.identificador !== registroAlvo.identificador;
    } catch {
      return true;
    }
  });

  const novoConteudo = blocosMantidos.join("\n\n") + "\n\n";
  try {
    await fs.writeFile(cachePath, novoConteudo, "utf8");
    addInfo(
      `[model cache] Registro '${registroAlvo.identificador}' removido com sucesso do cache!`
    );
  } catch (e) {
    throw new Error(
      `[model cache] Erro ao reescrever os dados sem o registro removido no cache!, erro: ${e.message}`
    );
  }
  return true;
}
