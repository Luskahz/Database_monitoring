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
      case "date": {
        let parsed = null;
        if (typeof valor === "string") {
          // Aceita YYYY-MM-DD ou DD/MM/YYYY
          if (valor.includes("/")) {
            const [dia, mes, ano] = valor.split("/");
            parsed = `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
          } else {
            parsed = valor;
          }
        }
        novaLinha[col] = parsed || null;
        break;
      }
      case "datetime": {
        let parsed = null;
        if (typeof valor === "string") {
          const partes = valor.trim().replace(/\s+/, " ").split(" ");
          if (partes.length === 2) {
            const [data, hora] = partes;
            if (data.includes("/")) {
              const [dia, mes, ano] = data.split("/");
              parsed = `${ano}-${mes.padStart(2, "0")}-${dia.padStart(
                2,
                "0"
              )} ${hora}`;
            } else if (data.includes("-")) {
              parsed = `${data} ${hora}`;
            }
          }
        }
        novaLinha[col] = parsed || null;
        break;
      }
      case "time":
        if (typeof valor === "string") {
          novaLinha[col] = valor.match(/^\d{1,3}:\d{2}(:\d{2})?$/)
            ? valor
            : null;
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
