import { addAviso } from "../middleware/errorHandler.js";

export function sanitizeValue(value, tipoEsperado, contexto) {
  const isEmpty = value === "" || value === null || value === undefined;

  if (isEmpty) return null;

  switch (tipoEsperado) {
    case "int": {
      return parseIntSafe(value, contexto);
    }
    case "decimal": {
      const original = String(value).trim();
      const coordWeird = original
        .replace(/[\s\u00A0]+/g, "") // remove espaços/NBSP
        .replace(/[−–—―‐]/g, "-") // normaliza hífen unicode
        .match(/^(-?)(\d{1,2})\.(\d{3})\.(\d{3})$/);

      if (coordWeird) {
        return normalizeCoordinate(coordWeird);
      }

      return parseDecimal(value, contexto);
    }
    case "date": {
      return parseDate(value, contexto);
    }
    case "datetime": {
      return parseDateTime(value, contexto);
    }
    case "time": {
      return parseTime(value, contexto);
    }
    case "string":
    default:
      return String(value)
        .replace(/^\uFEFF/, "") // BOM
        .replace(/\r\n?/g, "\n")
        .trim();
  }
}

export default function sanitizeRow(row, tipos, contexto) {
  const novaLinha = {};
  for (const [campo, valor] of Object.entries(row ?? {})) {
    const tipo = tipos?.[campo] ?? "string";
    novaLinha[campo] = sanitizeValue(valor, tipo, contexto);
  }
  return novaLinha;
}

function parseDecimal(value, contexto) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const original = String(value).trim();

  // Casos triviais sem dígitos
  if (
    original === "" ||
    original === "-" ||
    original === "," ||
    original === "."
  ) {
    addAviso(
      `decimal vazio, dado decimal foi setado como null, validar valor: [${value}]`,
      contexto
    );
    return null;
  }

  // Normaliza: remove espaços (inclui NBSP) e converte hífens unicode para '-'
  let s = original.replace(/[\s\u00A0]+/g, "").replace(/[−–—―‐]/g, "-");

  // Formato contábil (parênteses) => negativo
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }

  // Rejeita "sinal no meio" (ex.: 1-2, 1+2) -> provavelmente intervalo
  if (/\d-\d/.test(s) || /\d\+\d/.test(s)) {
    addAviso(
      `possível intervalo ou sinal no meio, decimal setado como null, validar valor: [${value}]`,
      contexto
    );
    return null;
  }

  // Sinal no começo ou no fim (ex.: -123, 123-) => negativo
  if (/^-/.test(s) || /-$/.test(s)) negative = true;

  // '+' só é aceito no começo; qualquer outro caso invalida
  if (/\+/.test(s) && !/^\+/.test(s)) {
    addAviso(
      `sinal '+' em posição inválida, decimal setado como null, validar valor: [${value}]`,
      contexto
    );
    return null;
  }
  s = s.replace(/^\+/, ""); // remove '+' inicial

  // Mantém apenas dígitos, vírgula, ponto e hífen
  s = s.replace(/[^\d.,-]/g, "");
  // Remove hífens (já marcamos negative)
  s = s.replace(/-/g, "");

  // Se não sobrou nenhum dígito, é inválido
  if (!/\d/.test(s)) {
    addAviso(
      `decimal vazio, dado decimal foi setado como null, validar valor: [${value}]`,
      contexto
    );
    return null;
  }

  // Detecta separador decimal com heurística
  const commaCount = (s.match(/,/g) || []).length;
  const dotCount = (s.match(/\./g) || []).length;

  let decimalSep = null;

  if (commaCount && dotCount) {
    // Ambos existem: o último entre ',' e '.' é o decimal
    decimalSep = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
  } else if (commaCount || dotCount) {
    const sep = commaCount ? "," : ".";
    const count = commaCount || dotCount;

    if (count > 1) {
      // Múltiplas ocorrências do MESMO separador -> tratar como milhares (sem decimal)
      decimalSep = null;
    } else {
      // Apenas uma ocorrência: se houver 3 dígitos à direita, interpretar como milhar
      const idx = s.lastIndexOf(sep);
      const fracLen = s.length - idx - 1;
      decimalSep = fracLen === 3 ? null : sep;
    }
  } // senão continua null (sem separadores)

  // Normaliza para ponto como separador decimal
  let normalized;
  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep);
    const intPart = s.slice(0, idx).replace(/[.,]/g, "");
    const fracPart = s.slice(idx + 1).replace(/[^\d]/g, "");
    const left = intPart === "" ? "0" : intPart; // permite ".5" => "0.5"
    normalized = fracPart.length > 0 ? `${left}.${fracPart}` : left;
  } else {
    normalized = s.replace(/[.,]/g, "");
    if (normalized === "") {
      addAviso(
        `decimal vazio, dado decimal foi setado como null, validar valor: [${value}]`,
        contexto
      );
      return null;
    }
  }

  let num = Number(normalized);
  if (!Number.isFinite(num)) {
    addAviso(
      `numero não finito, dado decimal foi setado como null, validar valor: [${value}]`,
      contexto
    );
    return null;
  }

  if (negative) num = -num;
  return num;
}

function parseIntSafe(value, contexto) {
  // Se já é inteiro, retorna como está
  if (typeof value === "number" && Number.isInteger(value)) return value;

  const str = String(value).trim();

  // Remove tudo que não for dígito, hífen, ponto ou vírgula
  let clean = str.replace(/[^\d\-.,]/g, "");

  // Remove pontos e vírgulas (tratando como separadores de milhar ou decimal)
  clean = clean.replace(/[.,]/g, "");

  // Valida formato do sinal
  if (
    (clean.includes("-") && !clean.startsWith("-")) ||
    (clean.match(/-/g) || []).length > 1
  ) {
    addAviso(
      `dado int foi setado como null, validar valor: [${value}]`,
      contexto
    );
    return null;
  }

  const parsed = Number.parseInt(clean, 10);
  if (Number.isNaN(parsed)) {
    addAviso(`valor não pôde ser convertido para int: [${value}]`, contexto);
    return null;
  }

  return parsed;
}

function parseDate(value, contexto) {
  if (value == null) return null;
  const str = String(value).trim();
  if (str === "") return null;

  // helpers
  function fmt(y, m, d) {
    const mm = String(m).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }
  function isValidYMD(y, m, d) {
    if (y < 1000 || y > 9999) return false;
    if (m < 1 || m > 12) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    );
  }
  function logInvalid(why) {
    addAviso(
      `Valor date inválido (${why}), setado como null. Valor: [${value}]`,
      contexto
    );
  }

  // 1) YYYY-MM-DD
  {
    const m = str.match(/(^|\D)(\d{4})-(\d{2})-(\d{2})(\D|$)/);
    if (m) {
      const y = +m[2],
        mm = +m[3],
        dd = +m[4];
      if (!isValidYMD(y, mm, dd)) {
        logInvalid("YYYY-MM-DD inválido");
        return null;
      }
      return fmt(y, mm, dd);
    }
  }

  // 2) DD/MM/YYYY ou D/M/YYYY
  {
    const m = str.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})\b/);
    if (m) {
      const dd = +m[1],
        mm = +m[2],
        y = +m[3];
      if (!isValidYMD(y, mm, dd)) {
        logInvalid("DD/MM/YYYY inválido");
        return null;
      }
      return fmt(y, mm, dd);
    }
  }

  // 3) DDMMYYYY (8 dígitos)
  {
    const m = str.match(/\b(\d{2})(\d{2})(\d{4})\b/);
    if (m) {
      const dd = +m[1],
        mm = +m[2],
        y = +m[3];
      if (!isValidYMD(y, mm, dd)) {
        logInvalid("DDMMYYYY inválido");
        return null;
      }
      return fmt(y, mm, dd);
    }
  }

  // 3b) YYYYMMDD (8 dígitos — ano primeiro)
  // Colocado DEPOIS do DDMMYYYY para não rejeitar "01022024" como ano 0102 inválido.
  {
    const m = str.match(/\b(\d{4})(\d{2})(\d{2})\b/);
    if (m) {
      const y = +m[1],
        mm = +m[2],
        dd = +m[3];
      if (!isValidYMD(y, mm, dd)) {
        logInvalid("YYYYMMDD inválido");
        return null;
      }
      return fmt(y, mm, dd);
    }
  }

  // 4) DMMYYYY (7 dígitos) — dia 1 dígito + mês 2 dígitos
  {
    const m = str.match(/\b(\d{1})(\d{2})(\d{4})\b/);
    if (m) {
      const dd = +m[1],
        mm = +m[2],
        y = +m[3];
      if (!isValidYMD(y, mm, dd)) {
        logInvalid("DMMYYYY inválido");
        return null;
      }
      return fmt(y, mm, dd);
    }
  }

  // 5) MMYYYY / MYYYY / MM/YYYY / M/YYYY → assume dia = 1
  // Mantém depois dos formatos com dia para evitar capturar "13/2024" como mês/ano.
  {
    const m = str.match(/\b(\d{1,2})\s*\/?\s*(\d{4})\b/);
    if (m) {
      const mm = +m[1],
        y = +m[2];
      if (!isValidYMD(y, mm, 1)) {
        logInvalid("MMYYYY inválido");
        return null;
      }
      return fmt(y, mm, 1);
    }
  }

  {
    const m = str.match(/\b(\d{4})\/(\d{2})\/(\d{2})\b/);
    if (m) {
      const y = +m[1],
        mm = +m[2],
        dd = +m[3];
      if (!isValidYMD(y, mm, dd)) {
        logInvalid("YYYY/MM/DD inválido");
        return null;
      }
      return fmt(y, mm, dd);
    }
  }

  addAviso(
    `Valor date setado como null (formato não reconhecido), validar, valor: [${value}]`,
    contexto
  );
  return null;
}

function parseDateTime(value, contexto) {
  const str = String(value).replace(/\s+/g, " ").trim();
  if (str === "") {
    addAviso(
      `Valor datetime setado como null (vazio), validar, valor: [${value}]`,
      contexto
    );
    return null;
  }

  // helpers
  const pad2 = (n) => String(n).padStart(2, "0");
  const clampMs = (s) => (s.length <= 6 ? s : s.slice(0, 6)); // MySQL DATETIME(6)
  const fmt = (y, m, d, h = "00", min = "00", s = "00", frac = null) =>
    `${y}-${pad2(m)}-${pad2(d)} ${pad2(h)}:${pad2(min)}:${pad2(s)}${
      frac ? `.${frac}` : ""
    }`;

  const isValidYMD = (y, m, d) => {
    y = +y;
    m = +m;
    d = +d;
    if (y < 1000 || y > 9999) return false;
    if (m < 1 || m > 12) return false;
    const mdays = [
      31,
      y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31,
    ];
    return d >= 1 && d <= mdays[m - 1];
  };
  const isValidHMS = (h, min, s) => {
    h = +h;
    min = +min;
    s = +s;
    return h >= 0 && h <= 23 && min >= 0 && min <= 59 && s >= 0 && s <= 59;
  };
  const logInvalid = (why) =>
    addAviso(
      `Valor datetime inválido (${why}), setado como null. Valor: [${value}]`,
      contexto
    );

  let m;

  // 1) ISO-like: YYYY-MM-DD[ T]HH:mm[:ss][.frac][Z|±HH:MM|±HHMM|±HH]
  m = str.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?(Z|[+-]\d{2}:?\d{2}|[+-]\d{2})?$/
  );
  if (m) {
    const [, y, mo, d, h, mi, s = "00", frac] = m;
    if (!isValidYMD(y, mo, d) || !isValidHMS(h, mi, s)) {
      logInvalid("ISO-like");
      return null;
    }
    return fmt(y, mo, d, h, mi, s, frac ? clampMs(frac) : null); // ignora Z/offset sem deslocar
  }

  // 2) BR com hora: DD/MM/YYYY[ T]HH:mm[:ss][.frac] (aceita 1-2 dígitos para dia/mês/hora)
  m = str.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?$/
  );
  if (m) {
    let [, d, mo, y, h, mi, s = "00", frac] = m;
    if (!isValidYMD(y, mo, d) || !isValidHMS(h, mi, s)) {
      logInvalid("BR com hora");
      return null;
    }
    return fmt(y, mo, d, h, mi, s, frac ? clampMs(frac) : null);
  }

  // 3) Somente data BR: DD/MM/YYYY
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    if (!isValidYMD(y, mo, d)) {
      logInvalid("data BR");
      return null;
    }
    return fmt(y, mo, d);
  }

  // 4) Somente data ISO: YYYY-MM-DD
  m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const [, y, mo, d] = m;
    if (!isValidYMD(y, mo, d)) {
      logInvalid("data ISO");
      return null;
    }
    return fmt(y, mo, d);
  }

  // 5) Compacto: YYYYMMDDHHmmss
  m = str.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (m) {
    const [, y, mo, d, h, mi, s] = m;
    if (!isValidYMD(y, mo, d) || !isValidHMS(h, mi, s)) {
      logInvalid("YYYYMMDDHHmmss");
      return null;
    }
    return fmt(y, mo, d, h, mi, s);
  }

  // 6) DDMMYYYY HHmmss
  m = str.match(/^(\d{2})(\d{2})(\d{4}) (\d{2})(\d{2})(\d{2})$/);
  if (m) {
    const [, d, mo, y, h, mi, s] = m;
    if (!isValidYMD(y, mo, d) || !isValidHMS(h, mi, s)) {
      logInvalid("DDMMYYYY HHmmss");
      return null;
    }
    return fmt(y, mo, d, h, mi, s);
  }

  // 7) "DD/MM/YYYY - HH:mm:ss" (agora aceita 1–2 dígitos para dia/mês/hora)
  m = str.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2}):(\d{2}):(\d{2})$/
  );
  if (m) {
    const [, d, mo, y, h, mi, s] = m;
    if (!isValidYMD(y, mo, d) || !isValidHMS(h, mi, s)) {
      logInvalid("BR com ' - '");
      return null;
    }
    return fmt(y, mo, d, h, mi, s);
  }

  addAviso(
    `Valor datetime setado como null (formato não reconhecido), validar, valor: [${value}]`,
    contexto
  );
  return null;
}
function parseTime(value, contexto) {
  const str = String(value).trim();

  // Aceita H:MM, HH:MM, HHH:MM, com :SS opcional; permite 1–2 dígitos para MM/SS
  const m = str.match(/^(\d{1,3})\s*:\s*(\d{1,2})(?:\s*:\s*(\d{1,2}))?$/);
  if (!m) {
    addAviso(
      `Valor time setado como null (formato não reconhecido), validar, valor: [${value}]`,
      contexto
    );
    return null;
  }

  const [, hStr, mStr, sStr] = m;
  const h = parseInt(hStr, 10);
  const min = parseInt(mStr, 10);
  const sec = sStr !== undefined ? parseInt(sStr, 10) : 0;

  // Validação de faixa (duração/relógio):
  // - Horas: permite 0..999 (ajuste se quiser outra faixa)
  // - Min/Seg: 0..59
  if (
    !Number.isFinite(h) ||
    h < 0 ||
    h > 999 ||
    !Number.isFinite(min) ||
    min < 0 ||
    min > 59 ||
    !Number.isFinite(sec) ||
    sec < 0 ||
    sec > 59
  ) {
    addAviso(
      `Valor time inválido (fora de faixa), setado como null. Valor: [${value}]`,
      contexto
    );
    return null;
  }

  // Formata sempre HH:MM:SS (horas com pelo menos 2 dígitos; >99 permanece como está)
  const hh = String(h).length >= 2 ? String(h) : String(h).padStart(2, "0");
  const mm = String(min).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");

  return `${hh}:${mm}:${ss}`;
}
function normalizeCoordinate(match) {
  const sign = match[1] === "-" ? -1 : 1;
  const intPart = match[2];
  const fracPart = match[3] + match[4];
  return sign * Number(`${intPart}.${fracPart}`);
}



