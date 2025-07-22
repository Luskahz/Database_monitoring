import crypto from "crypto";
import { addErro } from "../middleware/errorHandler.js";

export default function createHashByData(dataJson) {
  try {
    const hash = crypto
      .createHash("sha256")
      .update(JSON.stringify(dataJson))
      .digest("hex");
    return hash;
  } catch (e) {
   throw new Error(`Houve um erro ao gerar o hash do arquivo, erro: ${e.message}`);
  }
}
