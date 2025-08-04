import { addAviso } from "../middleware/errorHandler.js";

export function sanitizeValue(value, tipoEsperado) {
  const isEmpty = value === "" || value === null || value === undefined;

  if (isEmpty) return null;

  switch (tipoEsperado) {
    case "int": {
      const clean = String(value).replace(/[^\d-]/g, "");
      const parsed = parseInt(clean, 10);
      if (isNaN(parsed)) {
        addAviso(`dado int foi setado como null, validar valor: [${value}]`);
      }

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

      if (valueStr.includes(",") && valueStr.includes(".")) {
        if (valueStr.indexOf(",") > valueStr.indexOf(".")) {
          raw = valueStr.replace(/\./g, "").replace(",", ".");
        } else {
          raw = valueStr.replace(/,/g, "");
        }
      } else if (valueStr.includes(",")) {
        raw = valueStr.replace(",", ".");
      } else {
        raw = valueStr;
      }

      const parsed = parseFloat(raw);
      if (isNaN(parsed)) {
        addAviso(
          `dado decimal foi setado como null, validar valor: [${value}]`
        );
      }

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
      } else if ((match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
        // YYYY-MM-DD
        return str;
      } else if ((match = str.match(/^(\d{2})(\d{2})(\d{4})$/))) {
        // DDMMYYYY
        const [_, d, m, y] = match;
        return `${y}-${m}-${d}`;
      } else if ((match = str.match(/^(\d{1})(\d{2})(\d{4})$/))) {
        // DMMYYYY
        const [_, d, m, y] = match;
        return `${y}-${m}-${d.padStart(2, "0")}`;
      } else {
        addAviso(`valor data setado como null, validar, valor: [${value}] `);
        return null;
      }
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
      else if (
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
      else if (
        (match = str.match(
          /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/
        ))
      ) {
        return str.replace("T", " ");
      }

      // 3. DD/MM/YYYY
      else if ((match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) {
        const [_, d, m, y] = match;
        return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")} 00:00:00`;
      }

      // 4. YYYY-MM-DD
      else if ((match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
        return `${match[1]}-${match[2]}-${match[3]} 00:00:00`;
      }

      // 5. YYYYMMDDHHmmss
      else if (
        (match = str.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/))
      ) {
        const [_, y, m, d, h, min, s] = match;
        return `${y}-${m}-${d} ${h}:${min}:${s}`;
      }

      // 6. DDMMYYYY HHmmss
      else if (
        (match = str.match(/^(\d{2})(\d{2})(\d{4}) (\d{2})(\d{2})(\d{2})$/))
      ) {
        const [_, d, m, y, h, min, s] = match;
        return `${y}-${m}-${d} ${h}:${min}:${s}`;
      } else if (
        (match = str.match(
          /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})\.(\d{3})(Z)?$/
        ))
      ) {
        const [_, y, m, d, h, min, s, ms] = match;
        return `${y}-${m}-${d} ${h}:${min}:${s}.${ms}`;
      } else {
        addAviso(`Valor datetime setado como null, validar, valor: [${value}]`);
        return null;
      }
    }

    case "time": {
      const str = String(value).trim();
      const match = str.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
      if (!match) {
        addAviso(`Valor time setado como null validar, valor [${value}]`);
        return null;
      }

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
