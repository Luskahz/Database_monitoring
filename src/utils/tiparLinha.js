import normalizar from "./normalizar.js";

export default function tiparLinha(linha, schema) {
  const novaLinha = {};
  for (const col in schema) {
    const valor = linha[col] ?? linha[normalizar(col)] ?? null; // só tenta normalizar se o valor não der certo
    const tipo = schema[col];

    switch (tipo) {
      case "int":
        const intVal = parseInt(valor);
        novaLinha[col] = isNaN(intVal) ? null : intVal;
        break;
      case "float":
      case "decimal":
        const floatVal = parseFloat(valor?.toString().replace(",", "."));
        novaLinha[col] = isNaN(floatVal) ? null : floatVal;
        break;
      case "date":
        const data = new Date(valor);
        novaLinha[col] = isNaN(data) ? null : data.toISOString().split("T")[0];
        break;
       case "time":
        if (typeof valor === "string") {
          novaLinha[col] = valor.match(/^\d{1,3}:\d{2}(:\d{2})?$/) ? valor : null;
        } else if (typeof valor === "number") {
          novaLinha[col] = valor; // já está em minutos, mantem
        } else {
          novaLinha[col] = null;
        }
        break;
      default:
        novaLinha[col] = valor || null;
    }
  }
  return novaLinha;
}