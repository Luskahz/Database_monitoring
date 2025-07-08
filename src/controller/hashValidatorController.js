import { getLogByFile, getAllHashesFromTable } from "../model/logModel.js";

export default async function hashValidatorController(fileName, tabela, hash, next) {
  try {
    const logs = await getLogByFile(fileName, tabela); 
    const allHashes = await getAllHashesFromTable(tabela);

    if (!logs || logs.length === 0) {
      console.log(`\x1b[32m[NOVO ARQUIVO]\x1b[0m ${fileName} será processado.`);
      return "inserir";
    }
    const hashJaExiste = allHashes.some((entry) => entry.hash_arquivo === hash);
    if (hashJaExiste) {
      console.log(`\x1b[33m[ARQUIVO DUPLICADO]\x1b[0m O conteúdo de ${fileName} já está presente na base.`);
      return "ignorar";
    }

    // 3. Nome do arquivo já existe, mas hash é diferente → reprocessar
    console.log(`\x1b[31m[ARQUIVO MODIFICADO]\x1b[0m ${fileName} já existia, mas foi alterado. Reprocessando.`);
    return "reprocessar";

  } catch (error) {
    next(error);
  }
}