import { getLogByFile, getAllHashesFromTable } from "../model/logModel.js";

export default async function fluxoValidatorController(fileName, tabela, hash, next) {
  try {
    //₢onsulta o model para validar os hashs que existem na tabela destino
    const logs = await getLogByFile(fileName, tabela); 
    const allHashes = await getAllHashesFromTable(tabela);

    if (!logs || logs.length === 0) {console.log(`\x1b[32m[NOVO ARQUIVO]\x1b[0m ${fileName} será processado.`);
      return "inserir";
    }
    const hashJaExiste = allHashes.some((entry) => entry.hash_arquivo === hash);
    if (hashJaExiste) {
      console.log(`\x1b[33m[ARQUIVO DUPLICADO]\x1b[0m O conteúdo de ${fileName} já está presente na base.`);
      return "ignorar";
    }
    console.log(`\x1b[31m[ARQUIVO MODIFICADO]\x1b[0m ${fileName} já existia, mas foi alterado. Reprocessando.`);
    return "reprocessar";
  } catch (error) {
    next(error);
  }
}
