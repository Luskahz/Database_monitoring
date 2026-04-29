(function bootstrapDashboard() {
  const mountNode = document.getElementById("app");

  if (!window.React || !window.ReactDOM || !mountNode) {
    if (mountNode) {
      mountNode.innerHTML =
        '<div class="boot-card"><p class="eyebrow">Database Monitoring</p><h1>React nao carregou</h1><p>O painel depende das bibliotecas React e ReactDOM no navegador.</p></div>';
    }
    return;
  }

  const h = window.React.createElement;
  const useEffect = window.React.useEffect;
  const useState = window.React.useState;
  const REFRESH_FALLBACK_MS = 5000;

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function formatDateTime(value) {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(date);
  }

  function formatRelative(value) {
    if (!value || value === "--") return "sem registro";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const diffMs = Date.now() - date.getTime();
    if (diffMs < 1000) return "agora";
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return diffSec + "s atras";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return diffMin + "min atras";
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return diffHour + "h atras";
    const diffDay = Math.floor(diffHour / 24);
    return diffDay + "d atras";
  }

  function metricValue(metrics, query) {
    const target = normalizeText(query);
    const entry = Object.entries(metrics || {}).find(function findMetric(pair) {
      return normalizeText(pair[0]).indexOf(target) >= 0;
    });
    return entry ? entry[1] : "--";
  }

  function fetchJson(url) {
    return fetch(url, {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    }).then(function parseResponse(response) {
      if (!response.ok) {
        throw new Error("Falha ao carregar " + url + " (" + response.status + ")");
      }
      return response.json();
    });
  }

  function Badge(props) {
    return h(
      "span",
      {
        className: "badge badge-" + (props.tone || "neutral"),
      },
      props.children
    );
  }

  function StatCard(props) {
    return h(
      "article",
      { className: "stat-card" },
      h("p", { className: "stat-label" }, props.label),
      h("strong", { className: "stat-value" }, props.value),
      props.note ? h("span", { className: "stat-note" }, props.note) : null
    );
  }

  function Panel(props) {
    return h(
      "section",
      { className: "panel " + (props.className || "") },
      h(
        "div",
        { className: "panel-head" },
        h(
          "div",
          null,
          h("p", { className: "eyebrow" }, props.kicker || "Visibilidade"),
          h("h2", null, props.title),
          props.subtitle ? h("p", { className: "panel-subtitle" }, props.subtitle) : null
        ),
        props.actions ? h("div", { className: "panel-actions" }, props.actions) : null
      ),
      h("div", { className: "panel-body" }, props.children)
    );
  }

  function EmptyState(props) {
    return h(
      "div",
      { className: "empty-state" },
      h("strong", null, props.title),
      h("p", null, props.description)
    );
  }

  function QueueItemList(props) {
    if (!props.items.length) {
      return h(EmptyState, {
        title: props.emptyTitle,
        description: props.emptyDescription,
      });
    }

    return h(
      "div",
      { className: "queue-list" },
      props.items.map(function renderItem(item, index) {
        return h(
          "article",
          {
            key: item.raw || item.label || index,
            className: "queue-item",
          },
          h(
            "div",
            { className: "queue-item-head" },
            h("strong", { className: "queue-title" }, item.file || item.label || "item"),
            item.action
              ? h(Badge, { tone: "info" }, item.action)
              : h(Badge, { tone: "neutral" }, "evento")
          ),
          item.finishedAt
            ? h("p", { className: "queue-meta" }, formatDateTime(item.finishedAt))
            : null,
          item.stage ? h("p", { className: "queue-meta" }, "Stage: " + item.stage) : null,
          item.waiting ? h("p", { className: "queue-meta" }, item.waiting) : null,
          item.status ? h("p", { className: "queue-meta" }, "Status: " + item.status) : null,
          item.detail ? h("p", { className: "queue-detail" }, item.detail) : null,
          item.progressPercent != null
            ? h(
                "div",
                { className: "progress-shell" },
                h("div", {
                  className: "progress-bar",
                  style: {
                    width: Math.max(0, Math.min(100, item.progressPercent)) + "%",
                  },
                })
              )
            : null,
          h(
            "div",
            { className: "queue-item-foot" },
            item.progressText ? h("span", null, item.progressText) : null,
            item.elapsed ? h("span", null, item.elapsed) : null,
            item.duration ? h("span", null, item.duration) : null
          )
        );
      })
    );
  }

  function LogLine(props) {
    return h(
      "article",
      { className: "log-line" },
      h(
        "div",
        { className: "log-meta" },
        h("span", { className: "log-time" }, props.line.time || "--"),
        h(
          Badge,
          {
            tone:
              props.line.level === "ERROR"
                ? "danger"
                : props.line.level === "WARN"
                  ? "warn"
                  : "success",
          },
          props.line.level || "INFO"
        )
      ),
      h("pre", { className: "log-message" }, props.line.message || props.line.raw)
    );
  }

  function ConsoleTextBox(props) {
    const lines = props.lines || [];
    const text = lines
      .map(function mapLine(line) {
        return line.raw || line.message || "";
      })
      .join("\n");

    return h(
      "div",
      { className: "console-box" },
      h(
        "div",
        { className: "console-box-head" },
        h("span", { className: "console-box-title" }, "Console do processo"),
        props.path ? h("span", { className: "console-box-path" }, props.path) : null
      ),
      h(
        "div",
        { className: "console-box-body" },
        h("pre", { className: "console-box-pre" }, text || "Sem linhas no console para exibir.")
      )
    );
  }

  function App() {
    const [health, setHealth] = useState(null);
    const [queueResponse, setQueueResponse] = useState(null);
    const [activityResponse, setActivityResponse] = useState(null);
    const [globalLogResponse, setGlobalLogResponse] = useState(null);
    const [consoleLogResponse, setConsoleLogResponse] = useState(null);
    const [lastRefreshAt, setLastRefreshAt] = useState(null);
    const [activityLimit, setActivityLimit] = useState(150);
    const [levelFilter, setLevelFilter] = useState("ALL");
    const [selectedLogSource, setSelectedLogSource] = useState("activity");
    const [reloadToken, setReloadToken] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(function attachPolling() {
      let cancelled = false;
      let timerId = null;

      async function load() {
        try {
          const responses = await Promise.all([
            fetchJson("api/health"),
            fetchJson("api/queue"),
            fetchJson("api/activity?limit=" + activityLimit),
            fetchJson("api/global-log?limit=" + activityLimit),
            fetchJson("api/console-log?limit=" + activityLimit),
          ]);

          if (cancelled) return;

          setHealth(responses[0]);
          setQueueResponse(responses[1]);
          setActivityResponse(responses[2]);
          setGlobalLogResponse(responses[3]);
          setConsoleLogResponse(responses[4]);
          setLastRefreshAt(new Date().toISOString());
          setError("");
          setLoading(false);

          timerId = window.setTimeout(
            load,
            responses[1].refreshIntervalMs ||
              responses[2].refreshIntervalMs ||
              responses[3].refreshIntervalMs ||
              responses[4].refreshIntervalMs ||
              REFRESH_FALLBACK_MS
          );
        } catch (err) {
          if (cancelled) return;
          setError(err && err.message ? err.message : String(err));
          setLoading(false);
          timerId = window.setTimeout(load, REFRESH_FALLBACK_MS);
        }
      }

      load();

      return function cleanup() {
        cancelled = true;
        window.clearTimeout(timerId);
      };
    }, [activityLimit, reloadToken]);

    const snapshot = queueResponse && queueResponse.snapshot ? queueResponse.snapshot : {
      active: [],
      pending: [],
      completed: [],
      metrics: {},
      snapshotAt: null,
      filesMaxConcurrent: "--",
      activeCount: 0,
      pendingCount: 0,
      completedCount: 0,
    };

    const logSources = {
      activity: {
        key: "activity",
        label: "Activity",
        subtitle: "Fluxo principal consolidado do sistema.",
        response: activityResponse,
      },
      global: {
        key: "global",
        label: "Global",
        subtitle: "Logger___global.txt com eventos do contexto __global.",
        response: globalLogResponse,
      },
      console: {
        key: "console",
        label: "Console",
        subtitle: "Espelho do console do processo, sem alterar o monitoring.js.",
        response: consoleLogResponse,
      },
    };
    const currentLogSource = logSources[selectedLogSource] || logSources.activity;
    const currentLogResponse = currentLogSource.response;
    const currentLogLines = (currentLogResponse && currentLogResponse.lines) || [];
    const filteredLines = currentLogLines
      .filter(function filterLine(line) {
        return levelFilter === "ALL" || String(line.level || "").toUpperCase() === levelFilter;
      })
      .slice()
      .reverse();

    const dbThreads = metricValue(snapshot.metrics, "db threads conectados");
    const processlist = metricValue(snapshot.metrics, "processlist");
    const latency = metricValue(snapshot.metrics, "latencia");
    const queueStatusTone = snapshot.activeCount > 0 ? "success" : snapshot.pendingCount > 0 ? "warn" : "neutral";

    return h(
      "main",
      { className: "dashboard-shell" },
      h(
        "header",
        { className: "hero" },
        h(
          "div",
          { className: "hero-copy" },
          h("p", { className: "eyebrow" }, "Monitoramento em tempo real"),
          h("h1", null, "Dashboard do log principal"),
          h(
            "p",
            { className: "hero-text" },
            "Painel somente leitura conectado ao _activity.txt e ao snapshot da fila. Nada do fluxo de ingestao foi alterado."
          ),
          h(
            "div",
            { className: "hero-badges" },
            h(Badge, { tone: queueStatusTone }, "Ativos: " + snapshot.activeCount),
            h(Badge, { tone: snapshot.pendingCount > 0 ? "warn" : "neutral" }, "Pendentes: " + snapshot.pendingCount),
            h(Badge, { tone: "info" }, "DB threads: " + dbThreads),
            h(Badge, { tone: "neutral" }, "Processlist: " + processlist),
            h(Badge, { tone: "neutral" }, "Latencia: " + latency),
            h(Badge, { tone: "neutral" }, "Fonte atual: " + currentLogSource.label)
          )
        ),
        h(
          "div",
          { className: "hero-side" },
          h(StatCard, {
            label: "Ultimo refresh",
            value: formatRelative(lastRefreshAt),
            note: lastRefreshAt ? formatDateTime(lastRefreshAt) : "carregando",
          }),
          h(StatCard, {
            label: "Snapshot",
            value: formatRelative(snapshot.snapshotAt),
            note: snapshot.snapshotAt ? formatDateTime(snapshot.snapshotAt) : "sem snapshot",
          }),
          h(StatCard, {
            label: "Uptime",
            value: health ? health.uptimeSeconds + "s" : "--",
            note: health ? "PID " + health.pid : "processo",
          })
        )
      ),

      error
        ? h(
            "section",
            { className: "alert-banner" },
            h("strong", null, "Falha ao atualizar o painel."),
            h("span", null, error)
          )
        : null,

      h(
        "section",
        { className: "stats-grid" },
        h(StatCard, {
          label: "Files max concurrent",
          value: snapshot.filesMaxConcurrent,
          note: "configuracao atual",
        }),
        h(StatCard, {
          label: "In flight",
          value: metricValue(snapshot.metrics, "inflight"),
          note: "lotes em voo",
        }),
        h(StatCard, {
          label: "Pending batches",
          value: metricValue(snapshot.metrics, "pendingbatches"),
          note: "fila interna",
        }),
        h(StatCard, {
          label: "Memoria RSS",
          value: metricValue(snapshot.metrics, "memoria rss"),
          note: "uso do processo",
        }),
        h(StatCard, {
          label: "Heap usado",
          value: metricValue(snapshot.metrics, "heap usado"),
          note: "node.js",
        }),
        h(StatCard, {
          label: "Ultima checagem DB",
          value: formatRelative(metricValue(snapshot.metrics, "ultima verificacao")),
          note: formatDateTime(metricValue(snapshot.metrics, "ultima verificacao")),
        })
      ),

      h(
        "section",
        { className: "main-grid" },
        h(
          "div",
          { className: "queue-column" },
          h(
            Panel,
            {
              kicker: "Fila",
              title: "Arquivos ativos",
              subtitle: "Stages, progresso e detalhe do que esta rodando agora.",
            },
            loading && !snapshot.active.length
              ? h(EmptyState, {
                  title: "Carregando ativos",
                  description: "Buscando o primeiro snapshot da fila.",
                })
              : h(QueueItemList, {
                  items: snapshot.active,
                  emptyTitle: "Nenhum arquivo em processamento",
                  emptyDescription: "Quando houver trabalho ativo ele aparece aqui.",
                })
          ),
          h(
            Panel,
            {
              kicker: "Fila",
              title: "Pendentes",
              subtitle: "Arquivos aguardando despacho.",
            },
            h(QueueItemList, {
              items: snapshot.pending,
              emptyTitle: "Fila vazia",
              emptyDescription: "Nao ha arquivos aguardando neste momento.",
            })
          ),
          h(
            Panel,
            {
              kicker: "Historico",
              title: "Ultimos concluidos",
              subtitle: "Ultimos jobs finalizados pelo monitor.",
            },
            h(QueueItemList, {
              items: snapshot.completed,
              emptyTitle: "Sem historico",
              emptyDescription: "Os concluidos recentes aparecerao aqui.",
            })
          )
        ),
        h(
          "div",
          { className: "log-column" },
          h(
            Panel,
            {
              kicker: "Log principal",
              title: "Logs do sistema",
              subtitle: (currentLogResponse && currentLogResponse.truncated)
                ? "Exibindo o trecho mais recente de " + currentLogSource.label + " para manter a leitura leve."
                : currentLogSource.subtitle,
              actions: h(
                "div",
                { className: "toolbar" },
                h(
                  "div",
                  { className: "tab-strip" },
                  Object.values(logSources).map(function renderTab(source) {
                    return h(
                      "button",
                      {
                        key: source.key,
                        type: "button",
                        className:
                          "tab-button" +
                          (selectedLogSource === source.key ? " tab-button-active" : ""),
                        onClick: function onSourceChange() {
                          setSelectedLogSource(source.key);
                        },
                      },
                      source.label
                    );
                  })
                ),
                h(
                  "label",
                  { className: "toolbar-field" },
                  h("span", null, "Linhas"),
                  h(
                    "select",
                    {
                      value: activityLimit,
                      onChange: function onLimitChange(event) {
                        setActivityLimit(Number(event.target.value));
                      },
                    },
                    [100, 150, 250, 400].map(function renderOption(value) {
                      return h("option", { key: value, value: value }, value);
                    })
                  )
                ),
                h(
                  "label",
                  { className: "toolbar-field" },
                  h("span", null, "Nivel"),
                  h(
                    "select",
                    {
                      value: levelFilter,
                      onChange: function onFilterChange(event) {
                        setLevelFilter(event.target.value);
                      },
                    },
                    ["ALL", "INFO", "WARN", "ERROR"].map(function renderLevel(value) {
                      return h("option", { key: value, value: value }, value);
                    })
                  )
                ),
                h(
                  "button",
                  {
                    type: "button",
                    className: "refresh-button",
                    onClick: function forceReload() {
                      setReloadToken(function updateToken(current) {
                        return current + 1;
                      });
                    },
                  },
                  "Atualizar"
                )
              ),
            },
            selectedLogSource === "console"
              ? h(ConsoleTextBox, {
                  lines: filteredLines,
                  path: currentLogResponse && currentLogResponse.path,
                })
              : filteredLines.length
                ? h(
                    "div",
                    { className: "log-list" },
                    filteredLines.map(function renderLine(line) {
                      return h(LogLine, { key: line.id, line: line });
                    })
                  )
                : h(EmptyState, {
                    title: "Sem linhas para exibir",
                    description: "Ajuste o filtro ou aguarde novas entradas em " + currentLogSource.label + ".",
                  })
          ),
          h(
            Panel,
            {
              kicker: "Arquivos",
              title: "Fontes mapeadas",
              subtitle: "Caminhos atualmente consumidos pela interface.",
            },
            h(
              "div",
              { className: "metrics-list" },
              [
                ["Activity", health && health.activityLogPath],
                ["Queue", health && health.queueLogPath],
                ["Global", health && health.globalLogPath],
                ["Console", health && health.consoleLogPath],
              ].map(function renderPath(entry) {
                return h(
                  "div",
                  {
                    key: entry[0],
                    className: "metric-row",
                  },
                  h("span", { className: "metric-key" }, entry[0]),
                  h("strong", { className: "metric-value-inline" }, entry[1] || "--")
                );
              })
            )
          ),
          h(
            Panel,
            {
              kicker: "Metricas",
              title: "Snapshot bruto resumido",
              subtitle: "Leitura direta do arquivo _queue.txt ja gerado pelo sistema.",
            },
            h(
              "div",
              { className: "metrics-list" },
              Object.keys(snapshot.metrics).length
                ? Object.entries(snapshot.metrics).map(function renderMetric(entry) {
                    return h(
                      "div",
                      {
                        key: entry[0],
                        className: "metric-row",
                      },
                      h("span", { className: "metric-key" }, entry[0]),
                      h("strong", { className: "metric-value-inline" }, String(entry[1]))
                    );
                  })
                : h(EmptyState, {
                    title: "Sem metricas",
                    description: "O snapshot ainda nao trouxe dados adicionais.",
                  })
            )
          )
        )
      )
    );
  }

  window.ReactDOM.createRoot(mountNode).render(h(App));
})();
