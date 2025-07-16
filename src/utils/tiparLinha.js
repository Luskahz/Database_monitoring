import normalizar from "./normalizar.js";

export default function tiparLinha(linha, schema) {
  const novaLinha = {};
  for (const col in schema) {
    const valor = linha[col] ?? linha[normalizar(col)] ?? null;
    const tipo = schema[col];

    switch (tipo) {
      case "int":
        novaLinha[col] = parseInt(valor) || null;
        break;
      case "float":
      case "decimal":
        novaLinha[col] =
          parseFloat(valor?.toString().replace(",", ".")) || null;
        break;
      case "date":
        const data = new Date(valor);
        novaLinha[col] = isNaN(data) ? null : data.toISOString().split("T")[0];
        break;
      case "time":
        novaLinha[col] = valor?.match(/^\d{2}:\d{2}(:\d{2})?$/) ? valor : null;
        break;
      default:
        novaLinha[col] = valor || null;
    }
  }
  return novaLinha;
}