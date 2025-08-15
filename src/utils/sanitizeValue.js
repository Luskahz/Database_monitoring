import { addAviso } from "../middleware/errorHandler.js";

export function sanitizeValue(value, tipoEsperado, contexto) {
  const isEmpty = value === "" || value === null || value === undefined;
  if (isEmpty) return null;

  // Suporta string ("decimal") ou objeto { type: "decimal", ... }
  const tipo =
    typeof tipoEsperado === "string" ? tipoEsperado : tipoEsperado?.type;
  const opts = typeof tipoEsperado === "object" ? tipoEsperado : undefined;

  switch (tipo) {
    case "int": {
      return parseIntSafe(value, contexto);
    }
    case "decimal": {
      const original = String(value).trim();

      // coord "estranha" só se explicitamente permitido
      if (opts?.coordWeird) {
        const coordWeird = original
          .replace(/[\s\u00A0]+/g, "")
          .replace(/[−–—―‐]/g, "-")
          .match(/^(-?)(\d{1,2})\.(\d{3})\.(\d{3})$/);
        if (coordWeird) return normalizeCoordinate(coordWeird);
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
    default:
      return String(value)
        .replace(/^\uFEFF/, "")
        .replace(/\r\n?/g, "\n")
        .trim();
  }
}

export default function sanitizeRow(row, tipos, contexto) {
  const novaLinha = {};
  for (const [campo, valor] of Object.entries(row ?? {})) {
    const tipoCfg = tipos?.[campo] ?? "string";
    const tipoCfgComCampo =
      typeof tipoCfg === "object" && tipoCfg?.type === "decimal"
        ? { ...tipoCfg, _field: campo } // <-- injeta o nome do campo
        : tipoCfg;

    // contexto permanece exatamente o filepath
    novaLinha[campo] = sanitizeValue(valor, tipoCfgComCampo, contexto);
  }
  return novaLinha;
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
    addAviso(prefix + msg, contexto); // contexto = filepath intacto
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
  let s = original.replace(/[\s\u00A0]+/g, "").replace(/[−–—―‐]/g, "-");

  // contábil (parênteses) = negativo
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }

  // rejeita "sinal no meio" 1-2 / 1+2
  if (/\d-\d/.test(s) || /\d\+\d/.test(s)) {
    warn(`possível intervalo (sinal no meio), decimal=null: [${value}]`);
    return null;
  }

  // sinal no começo/fim
  if (/^-/.test(s) || /-$/.test(s)) negative = true;
  if (/\+/.test(s) && !/^\+/.test(s)) {
    warn(`'+' em posição inválida, decimal=null: [${value}]`);
    return null;
  }
  s = s.replace(/^\+/, "");

  // mantém apenas dígitos, vírgula, ponto e hífen
  s = s.replace(/[^\d.,-]/g, "");
  s = s.replace(/-/g, "");

  if (!/\d/.test(s)) {
    warn(`decimal vazio, setado como null, valor: [${value}]`);
    return null;
  }

  // Estratégia de separadores
  const commaCount = (s.match(/,/g) || []).length;
  const dotCount = (s.match(/\./g) || []).length;

  let decSep = null;

  // 1) Decisor explícito
  if (decimalSep === "," || decimalSep === ".") {
    const sep = decimalSep;
    const last = s.lastIndexOf(sep);
    if (last >= 0) {
      const intPart = s.slice(0, last).replace(/[.,]/g, "");
      const fracPart = s.slice(last + 1).replace(/[^\d]/g, "");
      decSep = sep;
      s = `${intPart}.${fracPart}`;
    } else {
      // sem separador decimal → remove possíveis milhares conforme política
      s =
        thousands === "never" ? s.replace(/[.,]/g, "") : s.replace(/[.,]/g, "");
      // acima é igual nos dois casos; se quiser, pode preservar pontos quando decimalSep fixo
    }
  }

  // 2) Auto: ambos presentes → o último é decimal
  if (!decSep && commaCount && dotCount) {
    decSep = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const last = s.lastIndexOf(decSep);
    const intPart = s.slice(0, last).replace(/[.,]/g, "");
    const fracPart = s.slice(last + 1).replace(/[^\d]/g, "");
    s = `${intPart}.${fracPart}`;
  }

  // 3) Auto: apenas um tipo de separador
  if (!decSep && (commaCount || dotCount)) {
    const sep = commaCount ? "," : ".";
    const count = commaCount || dotCount;
    const last = s.lastIndexOf(sep);
    const intLen = last >= 0 ? last : s.length;
    const fracLen = last >= 0 ? s.length - last - 1 : 0;

    // preferências por perfil
    const preferDecimal = profile === "quantity"; // quantidade tende a ter casas decimais
    const preferThousands = profile === "money"; // dinheiro tende a ter milhares

    if (count > 1) {
      // múltiplos do mesmo separador:
      // money → tratar como milhares (sem decimal)
      // quantity → se o último está perto do fim com 1..6 dígitos, assume decimal; senão, milhares
      if (preferThousands) {
        s = s.replace(/[.,]/g, "");
      } else {
        if (last >= 0) {
          const fracLen2 = s.length - last - 1;
          if (fracLen2 >= 1 && fracLen2 <= 6) {
            const intPart = s.slice(0, last).replace(/[.,]/g, "");
            const fracPart = s.slice(last + 1).replace(/[^\d]/g, "");
            decSep = sep;
            s = `${intPart}.${fracPart}`;
          } else {
            s = s.replace(/[.,]/g, "");
          }
        } else {
          s = s.replace(/[.,]/g, "");
        }
      }
    } else {
      // apenas uma ocorrência desse separador
      if (fracLen === 3) {
        // regra ambígua
        if (preferDecimal) {
          // quantidade: com poucos dígitos antes, tratar como decimal
          decSep = intLen <= 3 ? sep : null;
        } else {
          // dinheiro: tender a milhares
          decSep = null;
        }
      } else {
        // 1, 2, 4–6 dígitos → decimal
        decSep = sep;
      }

      if (decSep) {
        const intPart = s.slice(0, last).replace(/[.,]/g, "");
        const fracPart = s.slice(last + 1).replace(/[^\d]/g, "");
        s = `${intPart}.${fracPart}`;
      } else {
        s = s.replace(/[.,]/g, "");
      }
    }
  }

  // 4) nenhum separador detectado → fica como está
  if (!/^\d+(\.\d+)?$/.test(s)) {
    // limpeza final (se sobrou algum separador solto)
    s = s.replace(/[^\d.]/g, "");
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
  // arredonda mas devolve número, não string
  return Number(n.toFixed(maxFracDigits));
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
