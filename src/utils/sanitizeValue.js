import { addAviso } from "../middleware/errorHandler.js";

const RE_BOM = /^\uFEFF/;
const RE_CRLF = /\r\n?/g;
const RE_WS_NBSP = /[\s\u00A0]+/g; // espaços e NBSP
const RE_UNICODE_HYPHENS = /[−–—―‐]/g; // hífens unicode → "-"
const RE_COORD_WEIRD = /^(-?)(\d{1,2})\.(\d{3})\.(\d{3})$/; // ex: -12.345.678


// ==== reusáveis (evita recriar regex no hot path) ====
const RE_PARENS = /^\(.*\)$/;
const RE_INFIX_MINUS = /\d-\d/;
const RE_INFIX_PLUS = /\d\+\d/;
const RE_NON_DEC_CHARS = /[^\d.,-]/g;
const RE_DASH = /-/g;
const RE_KEEP_DIGIT_DOT_COMMA_DASH = /[^\d\-.,]/g;
const RE_DOTS_COMMAS = /[.,]/g;
const RE_HAS_DIGIT = /\d/;
const RE_ONLY_DIGIT_DOT = /[^\d.]/g;

// parseDate: pré-compila padrões (mantém semântica do seu código)
const RE_DATE_ISO_INLINE = /(^|\D)(\d{4})-(\d{2})-(\d{2})(\D|$)/;
const RE_DATE_BR = /\b(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})\b/;
const RE_DATE_DDMMYYYY = /\b(\d{2})(\d{2})(\d{4})\b/;
const RE_DATE_YYYYMMDD = /\b(\d{4})(\d{2})(\d{2})\b/;
const RE_DATE_DMMYYYY = /\b(\d{1})(\d{2})(\d{4})\b/;
const RE_DATE_MMYYYY = /\b(\d{1,2})\s*\/?\s*(\d{4})\b/;
const RE_DATE_YYYY_MM_DD_SLASH = /\b(\d{4})\/(\d{2})\/(\d{2})\b/;

const RE_WS_MULTI = /\s+/g;

const RE_DT_ISO_LIKE =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?(Z|[+-]\d{2}:?\d{2}|[+-]\d{2})?$/;
const RE_DT_BR_TIME =
  /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?$/;
const RE_DATE_BR_ONLY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const RE_DATE_ISO_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_DT_COMPACT_YYYYMMDDHHMMSS =
  /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;
const RE_DT_DDMMYYYY_HHMMSS = /^(\d{2})(\d{2})(\d{4}) (\d{2})(\d{2})(\d{2})$/;
const RE_DT_BR_DASH_TIME =
  /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2}):(\d{2}):(\d{2})$/;

const RE_TIME_HH_MM_SS_OPT = /^(\d{1,3})\s*:\s*(\d{1,2})(?:\s*:\s*(\d{1,2}))?$/;

export function sanitizeValue(value, tipoEsperado, contexto) {
  // caminho rápido p/ vazio
  if (value === "" || value == null) return null;

  // Suporta string ("decimal") ou objeto { type: "decimal", ... }
  const isObj = typeof tipoEsperado === "object" && tipoEsperado !== null;
  const tipo =
    typeof tipoEsperado === "string"
      ? tipoEsperado
      : isObj
      ? tipoEsperado.type
      : undefined;
  const opts = isObj ? tipoEsperado : undefined;

  switch (tipo) {
    case "int": {
      return parseIntSafe(value, contexto);
    }
    case "decimal": {
      // coord "estranha" só se explicitamente permitido
      if (opts?.coordWeird) {
        const s = String(value)
          .trim()
          .replace(RE_WS_NBSP, "")
          .replace(RE_UNICODE_HYPHENS, "-");
        const m = s.match(RE_COORD_WEIRD);
        if (m) return normalizeCoordinate(m);
      }
      return parseDecimal(value, contexto, opts);
    }
    case "date":
      return parseDate(value, contexto);
    case "datetime":
      return parseDateTime(value, contexto);
    case "time":
      return parseTime(value, contexto);
    case "string":
    default: {
      // normaliza BOM + CRLF -> LF + trim
      return String(value).replace(RE_BOM, "").replace(RE_CRLF, "\n").trim();
    }
  }
}
export default function sanitizeRow(row, tipos, contexto) {
  const src = row || {};
  const out = {}; // manter {} para máxima compatibilidade com consumidores
  // iterar sem alocar entries/arrays
  for (const campo in src) {
    if (!Object.prototype.hasOwnProperty.call(src, campo)) continue;
    const valor = src[campo];

    let tipoCfg =
      tipos && Object.prototype.hasOwnProperty.call(tipos, campo)
        ? tipos[campo]
        : "string";

    // Evita alocação de objeto por linha: injeta _field uma ÚNICA vez por coluna decimal
    if (
      tipoCfg &&
      typeof tipoCfg === "object" &&
      tipoCfg.type === "decimal" &&
      tipoCfg._field !== campo
    ) {
      tipoCfg._field = campo;
    }

    out[campo] = sanitizeValue(valor, tipoCfg, contexto);
  }
  return out;
}


function countSep(s) {
  let commas = 0,
    dots = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 44) commas++; // ','
    else if (c === 46) dots++; // '.'
  }
  return { commas, dots };
}
function parseDecimal(value, contexto, options = {}) {
  // defaults
  const {
    profile = "money",
    decimalSep = "auto",
    thousands = "auto",
    maxFracDigits = null,
    _field = null, // <-- vem do sanitizeRow
  } = options;

  const warn = (msg) => {
    const prefix = _field ? `[${_field}] ` : "";
    addAviso(prefix + msg, contexto);
  };

  if (typeof value === "number" && Number.isFinite(value)) {
    return clampFrac(value, maxFracDigits);
  }

  const original = String(value).trim();
  if (
    original === "" ||
    original === "-" ||
    original === "," ||
    original === "."
  ) {
    warn(`decimal vazio, setado como null, valor: [${value}]`);
    return null;
  }

  // normaliza espaços e hífens unicode
  let s = original.replace(RE_WS_NBSP, "").replace(RE_UNICODE_HYPHENS, "-");

  // contábil (parênteses) = negativo
  let negative = false;
  if (RE_PARENS.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }

  // rejeita "sinal no meio" 1-2 / 1+2
  if (RE_INFIX_MINUS.test(s) || RE_INFIX_PLUS.test(s)) {
    warn(`possível intervalo (sinal no meio), decimal=null: [${value}]`);
    return null;
  }

  // sinal no começo/fim
  if (s.charCodeAt(0) === 45 /* '-' */ || s.charCodeAt(s.length - 1) === 45)
    negative = true;
  if (s.includes("+") && s.charCodeAt(0) !== 43 /* '+' */) {
    warn(`'+' em posição inválida, decimal=null: [${value}]`);
    return null;
  }
  if (s.charCodeAt(0) === 43) s = s.slice(1); // remove '+' inicial

  // mantém apenas dígitos, vírgula, ponto e hífen
  s = s.replace(RE_NON_DEC_CHARS, "").replace(RE_DASH, "");

  if (!RE_HAS_DIGIT.test(s)) {
    warn(`decimal vazio, setado como null, valor: [${value}]`);
    return null;
  }

  // Estratégia de separadores
  const { commas: commaCount, dots: dotCount } = countSep(s);
  let decSep = null;

  // 1) Decisor explícito
  if (decimalSep === "," || decimalSep === ".") {
    const sep = decimalSep;
    const last = s.lastIndexOf(sep);
    if (last >= 0) {
      const intPart = s.slice(0, last).replace(RE_DOTS_COMMAS, "");
      const fracPart = s.slice(last + 1).replace(/[^\d]/g, "");
      decSep = sep;
      s = `${intPart}.${fracPart}`;
    } else {
      // sem separador decimal → remove possíveis milhares (política atual remove todos)
      s = s.replace(RE_DOTS_COMMAS, "");
    }
  }

  // 2) Auto: ambos presentes → o último é decimal
  if (!decSep && commaCount && dotCount) {
    decSep = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const last = s.lastIndexOf(decSep);
    const intPart = s.slice(0, last).replace(RE_DOTS_COMMAS, "");
    const fracPart = s.slice(last + 1).replace(/[^\d]/g, "");
    s = `${intPart}.${fracPart}`;
  }

  // 3) Auto: apenas um tipo de separador
  if (!decSep && (commaCount || dotCount)) {
    const sep = commaCount ? "," : ".";
    const count = commaCount || dotCount;
    const last = s.lastIndexOf(sep);
    const left = last >= 0 ? s.slice(0, last) : s;
    const right = last >= 0 ? s.slice(last + 1) : "";
    const fracLen = right.length;

    // intLen efetivo: ignora zeros à esquerda
    const leftTrimmed = left.replace(/^0+/, "");
    const intLenEff =
      leftTrimmed.length === 0 ? (left.length > 0 ? 1 : 0) : leftTrimmed.length;

    // preferências por perfil
    const preferDecimal = profile === "quantity" || thousands === "never";
    const preferThousands = profile === "money" && thousands !== "never";

    if (count > 1) {
      if (preferDecimal) {
        const intPart = left.replace(RE_DOTS_COMMAS, "");
        const fracPart = right.replace(/[^\d]/g, "");
        decSep = sep;
        s = `${intPart}.${fracPart}`;
      } else {
        // money: trata como milhares
        s = s.replace(RE_DOTS_COMMAS, "");
      }
    } else {
      if (preferDecimal) {
        const intPart = left.replace(RE_DOTS_COMMAS, "");
        const fracPart = right.replace(/[^\d]/g, "");
        decSep = sep;
        s = `${intPart}.${fracPart}`;
      } else {
        if (preferThousands && fracLen === 3 && intLenEff > 3) {
          decSep = null;
          s = s.replace(RE_DOTS_COMMAS, "");
        } else {
          const intPart = left.replace(RE_DOTS_COMMAS, "");
          const fracPart = right.replace(/[^\d]/g, "");
          decSep = sep;
          s = `${intPart}.${fracPart}`;
        }
      }
    }
  }

  // 4) nenhum separador detectado → fica como está (limpeza final)
  if (!/^\d+(\.\d+)?$/.test(s)) {
    s = s.replace(RE_ONLY_DIGIT_DOT, "");
  }
  if (s === "") {
    warn(`decimal vazio, setado como null, valor: [${value}]`);
    return null;
  }

  let num = Number(s);
  if (!Number.isFinite(num)) {
    warn(`número não finito, decimal=null: [${value}]`);
    return null;
  }
  if (negative) num = -num;

  return clampFrac(num, maxFracDigits);
}
function clampFrac(n, maxFracDigits) {
  if (maxFracDigits == null) return n;
  return Number(n.toFixed(maxFracDigits));
}
function parseIntSafe(value, contexto) {
  if (typeof value === "number" && Number.isInteger(value)) return value;

  const str = String(value).trim();
  // remove tudo exceto dígitos, '-', '.' e ',' e depois remove '.' e ','
  let clean = str
    .replace(RE_KEEP_DIGIT_DOT_COMMA_DASH, "")
    .replace(RE_DOTS_COMMAS, "");

  // valida sinal: '-' só no início e no máx. 1 ocorrência
  if (
    (clean.includes("-") && clean.charCodeAt(0) !== 45) ||
    (clean.match(RE_DASH) || []).length > 1
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
    const mm = m < 10 ? `0${m}` : String(m);
    const dd = d < 10 ? `0${d}` : String(d);
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

  // 1) YYYY-MM-DD (inline)
  {
    const m = str.match(RE_DATE_ISO_INLINE);
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
    const m = str.match(RE_DATE_BR);
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
    const m = str.match(RE_DATE_DDMMYYYY);
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
  {
    const m = str.match(RE_DATE_YYYYMMDD);
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

  // 4) DMMYYYY (7 dígitos)
  {
    const m = str.match(RE_DATE_DMMYYYY);
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

  // 5) MMYYYY / MYYYY / MM/YYYY / M/YYYY → dia = 1
  {
    const m = str.match(RE_DATE_MMYYYY);
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

  // 6) YYYY/MM/DD
  {
    const m = str.match(RE_DATE_YYYY_MM_DD_SLASH);
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



const pad2 = (n) => {
  const s = String(n);
  return s.length < 2 ? "0" + s : s;
};
const clampMs = (s) => (s.length <= 6 ? s : s.slice(0, 6)); // DATETIME(6)

// ===== Optimized parseDateTime (mesma lógica/saída) =====
function parseDateTime(value, contexto) {
  const str = String(value).replace(RE_WS_MULTI, " ").trim();
  if (str === "") {
    addAviso(
      `Valor datetime setado como null (vazio), validar, valor: [${value}]`,
      contexto
    );
    return null;
  }

  // helpers (mantidos aqui para usar contexto/valor)
  const fmt = (y, m, d, h = "00", min = "00", s = "00", frac = null) =>
    `${y}-${pad2(m)}-${pad2(d)} ${pad2(h)}:${pad2(min)}:${pad2(s)}${
      frac ? `.${frac}` : ""
    }`;

  const isValidYMD = (y, m, d) => {
    y = +y;
    m = +m;
    d = +d;
    if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31)
      return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    );
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

  // 1) ISO-like
  let m = str.match(RE_DT_ISO_LIKE);
  if (m) {
    const [, y, mo, d, h, mi, s = "00", frac] = m;
    if (!isValidYMD(y, mo, d) || !isValidHMS(h, mi, s)) {
      logInvalid("ISO-like");
      return null;
    }
    return fmt(y, mo, d, h, mi, s, frac ? clampMs(frac) : null); // ignora Z/offset
  }

  // 2) BR com hora
  m = str.match(RE_DT_BR_TIME);
  if (m) {
    const [, d, mo, y, h, mi, s = "00", frac] = m;
    if (!isValidYMD(y, mo, d) || !isValidHMS(h, mi, s)) {
      logInvalid("BR com hora");
      return null;
    }
    return fmt(y, mo, d, h, mi, s, frac ? clampMs(frac) : null);
  }

  // 3) Somente data BR
  m = str.match(RE_DATE_BR_ONLY);
  if (m) {
    const [, d, mo, y] = m;
    if (!isValidYMD(y, mo, d)) {
      logInvalid("data BR");
      return null;
    }
    return fmt(y, mo, d);
  }

  // 4) Somente data ISO
  m = str.match(RE_DATE_ISO_ONLY);
  if (m) {
    const [, y, mo, d] = m;
    if (!isValidYMD(y, mo, d)) {
      logInvalid("data ISO");
      return null;
    }
    return fmt(y, mo, d);
  }

  // 5) Compacto: YYYYMMDDHHmmss
  m = str.match(RE_DT_COMPACT_YYYYMMDDHHMMSS);
  if (m) {
    const [, y, mo, d, h, mi, s] = m;
    if (!isValidYMD(y, mo, d) || !isValidHMS(h, mi, s)) {
      logInvalid("YYYYMMDDHHmmss");
      return null;
    }
    return fmt(y, mo, d, h, mi, s);
  }

  // 6) DDMMYYYY HHmmss
  m = str.match(RE_DT_DDMMYYYY_HHMMSS);
  if (m) {
    const [, d, mo, y, h, mi, s] = m;
    if (!isValidYMD(y, mo, d) || !isValidHMS(h, mi, s)) {
      logInvalid("DDMMYYYY HHmmss");
      return null;
    }
    return fmt(y, mo, d, h, mi, s);
  }

  // 7) "DD/MM/YYYY - HH:mm:ss"
  m = str.match(RE_DT_BR_DASH_TIME);
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

// ===== Optimized parseTime (mesma lógica/saída) =====
function parseTime(value, contexto) {
  const str = String(value).trim();
  const m = str.match(RE_TIME_HH_MM_SS_OPT);
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

  // HH pode ter 2+ dígitos (se >99 mantém como está)
  const hh = String(h).length >= 2 ? String(h) : pad2(h);
  const mm = pad2(min);
  const ss = pad2(sec);
  return `${hh}:${mm}:${ss}`;
}

// ===== Igual ao seu (sem mudança de lógica) =====
function normalizeCoordinate(match) {
  const sign = match[1] === "-" ? -1 : 1;
  const intPart = match[2];
  const fracPart = match[3] + match[4];
  return sign * Number(`${intPart}.${fracPart}`);
}
