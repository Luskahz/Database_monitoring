export function sanitizeValue(value, tipoEsperado) {
  if (value === "") return null;

  switch (tipoEsperado) {
    case "int":
      return parseInt(value.replace(/\./g, ""), 10);

    case "decimal":
      return parseFloat(value.replace(/\./g, "").replace(",", "."));

    case "date":

      const [d, m, y] = value.split("/");
      return y && m && d
        ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
        : null;

    case "time":
      return value.length >= 5 ? value.slice(-5) : null;

    case "string":
    default:
      return value;
  }
}

export default function sanitizeRow(row, tipos) {
  const novaLinha = {};
  for (const campo in row) {
    const tipo = tipos[campo] || "string";
    novaLinha[campo] = sanitizeValue(row[campo], tipo);
  }
  return novaLinha;
}