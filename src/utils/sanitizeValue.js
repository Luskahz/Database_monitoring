export function sanitizeValue(value, tipoEsperado) {
  if (value === "" || value === null || value === undefined) return null;

  switch (tipoEsperado) {
    case "int": {
      const clean = String(value).replace(/[^\d-]/g, "");
      const parsed = parseInt(clean, 10);
      return isNaN(parsed) ? null : parsed;
    }

    case "decimal": {
      const valueStr = String(value).trim();
      let raw = valueStr.replace(/[^\d.,-]/g, "");

      // Padrão coordenada com milhar e decimal pt-BR → "-23.831.402"
      const coordMatch = valueStr.match(/^(-?\d{1,2})\.(\d{3})\.(\d{3})$/);
      if (coordMatch) {
        return parseFloat(`${coordMatch[1]}.${coordMatch[2]}${coordMatch[3]}`);
      }

      if ((valueStr.match(/\./g) || []).length > 1) {
        raw = valueStr.replace(/\./g, "").replace(",", ".");
      } else if (valueStr.includes(",") && !valueStr.includes(".")) {
        raw = valueStr.replace(",", ".");
      } else {
        raw = valueStr; // já está no padrão correto
      }

      const parsed = parseFloat(raw);
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
    case "datetime": {
      const str = String(value).replace(/\s+/g, " ").trim();
      let match;
      if (
        (match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{1,2}):(\d{2})$/))
      ) {
        const [_, d, m, y, h, min] = match;
        return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")} ${h.padStart(
          2,
          "0"
        )}:${min}:00`;
      }

      // 1. DD/MM/YYYY HH:mm:ss
      if (
        (match = str.match(
          /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{1,2}):(\d{2}):(\d{2})$/
        ))
      ) {
        const [_, d, m, y, h, min, s] = match;
        return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")} ${h.padStart(
          2,
          "0"
        )}:${min}:${s}`;
      }

      // 2. YYYY-MM-DD HH:mm:ss
      if (
        (match = str.match(
          /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/
        ))
      ) {
        return str.replace("T", " ");
      }

      // 3. DD/MM/YYYY
      if ((match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) {
        const [_, d, m, y] = match;
        return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")} 00:00:00`;
      }

      // 4. YYYY-MM-DD
      if ((match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
        return `${match[1]}-${match[2]}-${match[3]} 00:00:00`;
      }

      // 5. YYYYMMDDHHmmss
      if ((match = str.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/))) {
        const [_, y, m, d, h, min, s] = match;
        return `${y}-${m}-${d} ${h}:${min}:${s}`;
      }

      // 6. DDMMYYYY HHmmss
      if (
        (match = str.match(/^(\d{2})(\d{2})(\d{4}) (\d{2})(\d{2})(\d{2})$/))
      ) {
        const [_, d, m, y, h, min, s] = match;
        return `${y}-${m}-${d} ${h}:${min}:${s}`;
      }

      if (
        (match = str.match(
          /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})\.(\d{3})(Z)?$/
        ))
      ) {
        const [_, y, m, d, h, min, s, ms] = match;
        return `${y}-${m}-${d} ${h}:${min}:${s}.${ms}`;
      }

      return null;
    }

    case "time": {
      const str = String(value).trim();
      const match = str.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
      if (!match) return null;

      // Padroniza sempre como string HHH:MM:SS (mesmo se vier HHH:MM)
      const [_, h, m, s] = match.map((v) =>
        v !== undefined ? parseInt(v, 10) : 0
      );
      return `${String(h).padStart(2, "0")}:${String(m).padStart(
        2,
        "0"
      )}:${String(s).padStart(2, "0")}`;
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
