const RE_CAMEL = /([a-z0-9])([A-Z])/g;
const RE_BOM   = /^\uFEFF/;
const RE_NON_ASCII_PRINTABLE = /[^\x20-\x7E]/g;  
const RE_PERCENT = /%/g;
const RE_DOT_WS  = /\s*\.\s*/g;                 
const RE_DASH_SLASH = /[-\\/]/g;
const RE_SPACES = /\s+/g;                        
const RE_NOT_ALNUM_UNDERSCORE = /[^a-zA-Z0-9_]/g; 
const RE_MULTI_UNDERSCORE = /_+/g;
const RE_TRIM_UNDERSCORE  = /^_+|_+$/g;

export default function normalizar(nome) {
  let s = String(nome ?? "");

  s = s.normalize("NFD");
  s = s.replace(RE_CAMEL, "$1_$2");
  s = s.replace(RE_BOM, "");
  s = s.replace(RE_NON_ASCII_PRINTABLE, "");
  s = s
    .replace(RE_PERCENT, "perc")
    .replace(RE_DOT_WS, "_")     
    .replace(RE_DASH_SLASH, "_") 
    .replace(RE_SPACES, "_");    

  s = s.replace(RE_NOT_ALNUM_UNDERSCORE, "");
  s = s.replace(RE_MULTI_UNDERSCORE, "_").replace(RE_TRIM_UNDERSCORE, "");

  return s.toLowerCase();
}
