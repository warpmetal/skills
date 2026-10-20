/**
 * chatgpt/ui/dashboard.ts - the dashboard app, as a self-contained HTML document.
 *
 * The MCP Apps spec (SEP-1865) documents the postMessage handshake directly, so
 * this app needs no SDK and no bundler: the document is served verbatim by the
 * `ui://` resource with the `text/html;profile=mcp-app` mime type, and its
 * inline script talks to the host the way the spec describes.
 *
 * The app is read-only. It renders the `structuredContent` of the tool result,
 * falls back to the text block when there is none, and never calls back into
 * the server: refreshing means re-running the entrypoint.
 */
export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>WarpMetal</title>
<style>
  :root { color-scheme: light dark; }
  body {
    font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    margin: 0;
    padding: 16px;
  }
  h1 { font-size: 16px; margin: 0 0 12px; }
  section { margin-bottom: 16px; }
  h2 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.65;
    margin: 0 0 8px;
    font-weight: 600;
  }
  ul { list-style: none; margin: 0; padding: 0; }
  li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 0;
    border-bottom: 1px solid rgba(127, 127, 127, 0.2);
  }
  li:last-child { border-bottom: 0; }
  .state { opacity: 0.7; font-variant-numeric: tabular-nums; }
  .empty, .error { opacity: 0.7; font-style: italic; }
  .warn { color: #b45309; font-size: 12px; margin-top: 4px; }
  .pill {
    display: inline-block;
    padding: 1px 8px;
    border-radius: 999px;
    background: rgba(127, 127, 127, 0.15);
    font-size: 12px;
  }
  #root[data-loading="true"] .loading { opacity: 0.6; }
</style>
</head>
<body>
<div id="root" data-loading="true">
  <h1>WarpMetal</h1>
  <div id="status"></div>
  <section>
    <h2>Servers</h2>
    <ul id="servers"><li class="empty loading">Loading…</li></ul>
  </section>
  <section>
    <h2>Tasks</h2>
    <ul id="tasks"><li class="empty loading">Loading…</li></ul>
  </section>
  <div id="warnings"></div>
</div>
<script>
(function () {
  "use strict";

  var nextId = 1;
  var pending = new Map();
  var toolResult = null;

  function post(message) {
    window.parent.postMessage(message, "*");
  }

  function sendRequest(method, params) {
    var id = nextId++;
    return new Promise(function (resolve, reject) {
      pending.set(id, { resolve: resolve, reject: reject });
      post({ jsonrpc: "2.0", id: id, method: method, params: params || {} });
    });
  }

  function sendNotification(method, params) {
    post({ jsonrpc: "2.0", method: method, params: params || {} });
  }

  // Registered before the handshake: the host may deliver the tool result as
  // soon as it sees the initialized notification.
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (data === null || typeof data !== "object") {
      return;
    }

    if (data.id !== undefined && pending.has(data.id)) {
      var entry = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) {
        entry.reject(new Error(String(data.error.message || data.error)));
      } else {
        entry.resolve(data.result);
      }
      return;
    }

    if (data.method === "ui/notifications/tool-result") {
      toolResult = data.params || null;
      render();
    } else if (data.method === "ui/notifications/tool-cancelled") {
      showError("The WarpMetal request was cancelled.");
    }
  });

  function text(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function clear(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function showError(message) {
    byId("root").removeAttribute("data-loading");
    clear(byId("status"));
    var list = byId("servers");
    clear(list);
    var item = document.createElement("li");
    item.className = "error";
    item.textContent = message;
    list.appendChild(item);
  }

  function renderList(id, rows, emptyText) {
    var list = byId(id);
    clear(list);
    if (!rows || rows.length === 0) {
      var empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = emptyText;
      list.appendChild(empty);
      return;
    }
    rows.forEach(function (row) {
      var item = document.createElement("li");
      var label = document.createElement("span");
      label.textContent = text(row.label);
      var state = document.createElement("span");
      state.className = "state";
      state.textContent = text(row.detail);
      item.appendChild(label);
      item.appendChild(state);
      list.appendChild(item);
    });
  }

  function render() {
    byId("root").removeAttribute("data-loading");
    if (!toolResult) {
      return;
    }

    var payload = toolResult.structuredContent;
    if (!payload || toolResult.isError) {
      showError("WarpMetal returned no status. Check that the warpmetal CLI is installed.");
      return;
    }

    var cli = payload.cli || {};
    var status = byId("status");
    clear(status);
    var version = document.createElement("span");
    version.className = "pill";
    version.textContent = "CLI " + (cli.version ? text(cli.version) : "unavailable");
    status.appendChild(version);
    if (cli.health) {
      var health = document.createElement("span");
      health.className = "pill";
      health.style.marginLeft = "8px";
      health.textContent = text(cli.health);
      status.appendChild(health);
    }

    renderList("servers", (payload.servers || []).map(function (row) {
      return { label: text(row.id), detail: text(row.state) };
    }), "No servers recorded on this host.");

    renderList("tasks", (payload.tasks || []).map(function (row) {
      var detail = row.status ? text(row.status) : "unknown";
      return { label: text(row.taskId), detail: row.stale ? detail + " (stale)" : detail };
    }), "No tasks observed in this session.");

    var warnings = byId("warnings");
    clear(warnings);
    (payload.warnings || []).slice(0, 5).forEach(function (warning) {
      var item = document.createElement("div");
      item.className = "warn";
      item.textContent = text(warning);
      warnings.appendChild(item);
    });
  }

  sendRequest("ui/initialize", {
    appCapabilities: { availableDisplayModes: ["inline", "fullscreen"] },
    appInfo: { name: "warpmetal-dashboard", version: "0.1.0" }
  })
    .then(function () {
      sendNotification("ui/notifications/initialized", {});
    })
    .catch(function () {
      showError("This host does not support the WarpMetal dashboard. Use the chat instead.");
    });
})();
</script>
</body>
</html>
`;
