import { getLogByFile } from "../model/logModel.js"

//validar se o hash do arquivo já foi inserido no banco, se não inserir, se sim substituir

export default async function hashValidatorController(fileName, Ano, tabela, hash, next) {
    try{
        const log = await getLogByFile(fileName, tabela);
        if (!log) {
            console.log(`\x1b[32m[NOVO ARQUIVO]\x1b[0m ${fileName} será processado.`);
            return "inserir";
        } else if(log.hash_arquivo === hash){
            console.log(`\x1b[33m[ARQUIVO REPETIDO]\x1b[0m ${fileName} já foi processado com o mesmo conteúdo.`);
            return "ignorar";
        } else {
            console.log(`\x1b[31m[ARQUIVO MODIFICADO]\x1b[0m ${fileName} já existia mas foi alterado. Reprocessando.`);
            return "reprocessar";
        }
    } catch (error) {
        next(error)
    }
}