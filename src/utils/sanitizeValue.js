function timeToMinutes(str) {
  // Aceita HHH:MM ou HHH:MM:SS
  const match = str.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, h, m, s] = match;
  return parseInt(h, 10) * 60 + parseInt(m, 10) + (s ? parseInt(s, 10) / 60 : 0);
}

export function sanitizeValue(value, tipoEsperado) {
  if (value === "" || value === null || value === undefined) return null;

  switch (tipoEsperado) {
    case "int": {
      const clean = String(value).replace(/[^\d-]/g, "");
      const parsed = parseInt(clean, 10);
      return isNaN(parsed) ? null : parsed;
    }

    case "decimal": {
      // Remove tudo que não for dígito, vírgula, ponto ou sinal negativo
      let clean = String(value).replace(/[^\d,.-]/g, "");
      // Troca vírgula por ponto se houver
      clean = clean.replace(",", ".");
      const parsed = parseFloat(clean);
      return isNaN(parsed) ? null : parsed;
    }

    case "date": {
      // Aceita DD/MM/YYYY, YYYY-MM-DD, DDMMYYYY, DMMYYYY, MMYYYY
      const str = String(value).trim();
      let match;
      if ((match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) {
        // DD/MM/YYYY
        const [_, d, m, y] = match;
        return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
      if ((match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
        // YYYY-MM-DD
        return str;
      }
      if ((match = str.match(/^(\d{2})(\d{2})(\d{4})$/))) {
        // DDMMYYYY
        const [_, d, m, y] = match;
        return `${y}-${m}-${d}`;
      }
      if ((match = str.match(/^(\d{1})(\d{2})(\d{4})$/))) {
        // DMMYYYY
        const [_, d, m, y] = match;
        return `${y}-${m}-${d.padStart(2, "0")}`;
      }
      return null;
    }

  case "time": {
  const str = String(value).trim();
  const match = str.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  // Padroniza sempre como string HHH:MM:SS (mesmo se vier HHH:MM)
  const [_, h, m, s] = match.map((v) => (v !== undefined ? parseInt(v, 10) : 0));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

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