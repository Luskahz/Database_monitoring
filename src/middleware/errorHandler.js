export default function chokidarErrorHandler(error) {
  if (error.code === 'ENOENT') {
    console.error('Erro: O caminho especificado não existe.');
  } else if (error.code === 'EACCES') {
    console.error('Erro: Permissão negada para acessar o caminho especificado.');
  } else if (error.code === 'ENOSPC') {
    console.error('Erro: Espaço insuficiente no dispositivo.');
  } else {
    console.error(`Erro desconhecido: ${error.message}`);
  }
}