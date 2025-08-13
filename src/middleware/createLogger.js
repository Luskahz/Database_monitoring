//createLogger.js
export async function createLoggerController(filePath) {
  const dir = path.dirname(filePath);
  const { name } = path.parse(filePath);
  const logPath = await getLoggerFileName(dir, name);

  try {
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.writeFile(logPath, "Processo iniciado...\n", "utf8");

    // registra para que o errorHandler saiba onde escrever
    registerLogFile(filePath, logPath);
  } catch (e) {
    console.log("[Logger] erro ao iniciar o arquivo de log");
  }
}
