const mensagens = {
  erros: [],
  infos: [],
  avisos: [],
};

export function addErro(msg) {
  mensagens.erros.push(msg);
}

export function addInfo(msg) {
  mensagens.infos.push(msg);
}

export function addAviso(msg) {
  mensagens.avisos.push(msg);
}

export function getAllErrors() {
  return { ...mensagens }; // Cópia segura
}

export function clearAllErrors() {
  mensagens.erros = [];
  mensagens.infos = [];
  mensagens.avisos = [];
}


