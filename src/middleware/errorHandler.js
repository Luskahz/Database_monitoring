const contextoDeMensagens = new Map();

export function addErro(msg, contexto = "__global") {
  if (!contextoDeMensagens.has(contexto)) {
    contextoDeMensagens.set(contexto, { erros: [], infos: [], avisos: [] });
  }
  contextoDeMensagens.get(contexto).erros.push(msg);
}

export function addInfo(msg, contexto = "__global") {
  if (!contextoDeMensagens.has(contexto)) {
    contextoDeMensagens.set(contexto, { erros: [], infos: [], avisos: [] });
  }
  contextoDeMensagens.get(contexto).infos.push(msg);
}

export function addAviso(msg, contexto = "__global") {
  if (!contextoDeMensagens.has(contexto)) {
    contextoDeMensagens.set(contexto, { erros: [], infos: [], avisos: [] });
  }
  contextoDeMensagens.get(contexto).avisos.push(msg);
}

export function getAllErrors(contexto = "__global") {
  return contextoDeMensagens.get(contexto) || { erros: [], infos: [], avisos: [] };
}

export function clearAllErrors(contexto = "__global") {
  contextoDeMensagens.set(contexto, { erros: [], infos: [], avisos: [] });
}

export function clearAllContexts() {
  contextoDeMensagens.clear();
}
