export function silencePapaDuplicatesStart() {
  const originalWarn = console.warn;
  console.warn = function (...args) {
    if (
      args.length === 1 &&
      typeof args[0] === "string" &&
      args[0].includes("Duplicate headers found and renamed.")
    ) {
      return; // ignora essa mensagem específica
    }
    return originalWarn.apply(console, args);
  };
  return () => {
    console.warn = originalWarn; // restaura
  };
}

export async function withSilencedPapaDuplicates(fn) {
  const stop = silencePapaDuplicatesStart();
  try {
    return await fn();
  } finally {
    stop();
  }
}