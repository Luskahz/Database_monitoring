(function bootstrapConsoleView() {
  const output = document.getElementById("console-output");
  const MAX_BYTES = 2 * 1024 * 1024;
  const REFRESH_FALLBACK_MS = 1500;
  let timerId = null;

  if (!output) {
    return;
  }

  function isNearBottom(element) {
    return element.scrollHeight - element.scrollTop - element.clientHeight < 48;
  }

  function scheduleNext(delayMs) {
    window.clearTimeout(timerId);
    timerId = window.setTimeout(loadConsole, delayMs);
  }

  async function fetchConsole() {
    const response = await fetch(`/api/console-stream?bytes=${MAX_BYTES}`, {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Falha ao carregar console (${response.status})`);
    }

    return response.json();
  }

  async function loadConsole() {
    const keepPinned = isNearBottom(output);

    try {
      const payload = await fetchConsole();
      const text = payload && payload.text ? payload.text : "";
      output.textContent = text || "Aguardando novas linhas do processo...";
      if (keepPinned) {
        output.scrollTop = output.scrollHeight;
      }
      scheduleNext(payload.refreshIntervalMs || REFRESH_FALLBACK_MS);
    } catch (error) {
      output.textContent =
        "[console-ui] Falha ao atualizar o console.\n" +
        (error && error.message ? error.message : String(error));
      scheduleNext(REFRESH_FALLBACK_MS);
    }
  }

  window.addEventListener("beforeunload", function cleanup() {
    window.clearTimeout(timerId);
  });

  loadConsole();
})();
