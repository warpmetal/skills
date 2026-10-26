/**
 * client.js - the browser half: WarpMetal tool results as their own conversation row.
 *
 * Hand-written on purpose. The browser artifact is not compiled code: the host
 * loads a `window.__ModuleLoader__.load` factory whose `id` is the package name,
 * hands it `require`, and React arrives from the module table (no bundled copy,
 * no CDN, no UMD search). A build step would add a toolchain to a package that
 * currently has none, for a module of a few hundred lines.
 *
 * The row replaces the host's generic one for eight read tools, keyed by their
 * public tool name in the `tool.call.toolview` slot. Everything it shows comes
 * from the tool result already recorded in the session, so fork, resume and
 * replay reconstruct it without any new data path.
 *
 * Rules this file follows, from the shipped `cordis-plugin-development` skill
 * (`references/ui-plugin.md`, `references/practices.md`):
 *
 *   - The factory is side-effect free; every registration happens in `apply`.
 *   - Only `react` is required. No `@deepseek-ai/dsh-client-*` module import, no
 *     `document.body`, no iframe, no second application.
 *   - Styling uses the host's `--dsw-alias-*` tokens, with literal colors only
 *     for the brand mark; a renamed token degrades the look, never the render.
 *   - A component must not throw: the host blanks a slot entry that crashes.
 *     The projection is therefore total and falls back to a minimal row.
 */
window.__ModuleLoader__.load({
  id: "@warpmetal/dsh-plugin",
  factory(require) {
    const React = require("react");
    const h = React.createElement;

    /** The MCP server's namespace, as the model and the session see it. */
    const TOOL_PREFIX = "mcp__warpmetal__";

    /**
     * The tools whose result is worth a purpose-built row. Every other WarpMetal
     * tool keeps the host's generic row: a smaller surface is easier to keep
     * correct, and the generic row already shows arguments and output.
     */
    const CARDED_TOOLS = [
      "wm_health",
      "wm_state_list",
      "wm_task_list",
      "wm_server_get",
      "wm_sandbox_list",
      "wm_sandbox_get",
      "wm_order_status",
      "wm_operation_get",
    ].map((name) => TOOL_PREFIX + name);

    /** Same bounds the ChatGPT dashboard app uses, for the same reason. */
    const MAX_ROWS = 20;
    const MAX_WARNINGS = 3;
    const MAX_RAW = 4000;

    /** Envelope statuses that mean "the operation did not succeed". */
    const ERROR_STATES = new Set([
      "FAILED",
      "DENIED",
      "CONFLICT",
      "UNAVAILABLE",
      "INCONCLUSIVE",
      "PAYMENT_REJECTED",
    ]);
    /** Envelope statuses that need a human before anything else happens. */
    const WARN_STATES = new Set(["MANUAL_REVIEW", "APPROVAL_REQUIRED"]);

    /** Concatenate the text blocks of a settled tool block. */
    function textOf(block) {
      if (block === null || typeof block !== "object") return "";
      if (Array.isArray(block.content)) {
        const parts = [];
        for (const part of block.content) {
          if (part && part.type === "text" && typeof part.text === "string") parts.push(part.text);
        }
        return parts.join("\n");
      }
      return typeof block.text === "string" ? block.text : "";
    }

    /** The `WmResult` envelope, when the result carries one. */
    function envelopeOf(block) {
      if (block === null || typeof block !== "object") return null;
      if (block.structuredContent !== null && typeof block.structuredContent === "object") {
        return block.structuredContent;
      }
      const text = textOf(block).trim();
      if (text === "") return null;
      try {
        const parsed = JSON.parse(text);
        return parsed !== null && typeof parsed === "object" ? parsed : null;
      } catch {
        return null;
      }
    }

    /** One id/state pair, from whichever field names the payload uses. */
    function rowOf(entry) {
      if (entry === null || typeof entry !== "object") return null;
      const id = firstString(entry, ["serverId", "taskId", "sandboxId", "operationId", "orderId", "id", "name"]);
      if (id === null) return null;
      const state =
        firstString(entry, ["state", "status", "lastStatus", "phase", "lifecycle", "kind"]) ?? null;
      const stale = entry.stale === true ? "stale" : null;
      return { id, state, note: stale };
    }

    function firstString(source, keys) {
      for (const key of keys) {
        const value = source[key];
        if (typeof value === "string" && value !== "") return value;
      }
      return null;
    }

    /** Arrays a WarpMetal payload is known to put collections in. */
    const COLLECTIONS = ["servers", "tasks", "sandboxes", "operations", "items", "rows", "orders"];

    function rowsOf(data) {
      if (data === null || typeof data !== "object") return [];
      const rows = [];
      for (const key of COLLECTIONS) {
        const collection = data[key];
        if (!Array.isArray(collection)) continue;
        for (const entry of collection) {
          const row = rowOf(entry);
          if (row !== null) rows.push(row);
          if (rows.length >= MAX_ROWS) return rows;
        }
        return rows;
      }
      // A single-object payload (`wm_server_get`, `wm_order_status`, ...).
      const single = rowOf(data);
      return single === null ? [] : [single];
    }

    /**
     * Project a settled tool block into what the row renders.
     *
     * Total by construction: an unreadable block yields the degraded shape
     * (state plus one line of text), never an exception, because a throwing
     * component leaves the slot entry blank.
     */
    function projectWarpmetalResult(toolName, block) {
      const isError = block !== null && typeof block === "object" && block.isError === true;
      const interrupted =
        block !== null && typeof block === "object" && block.error && block.error.code === "interrupted";
      const envelope = envelopeOf(block);
      const rawText = textOf(block);
      const raw = rawText.length > MAX_RAW ? rawText.slice(0, MAX_RAW) + "\n…" : rawText;

      if (envelope === null) {
        const summary = firstLine(rawText);
        return {
          toolName,
          status: null,
          tone: isError ? "error" : interrupted ? "muted" : "ok",
          summary: summary === "" ? null : summary,
          rows: [],
          warnings: [],
          manualReview: false,
          raw,
        };
      }

      const status = typeof envelope.status === "string" ? envelope.status : null;
      const warnings = Array.isArray(envelope.warnings)
        ? envelope.warnings.filter((warning) => typeof warning === "string")
        : [];
      const manualReview =
        status === "MANUAL_REVIEW" || warnings.some((warning) => /manual[_\s-]?review/i.test(warning));
      const tone = isError
        ? "error"
        : interrupted
          ? "muted"
          : manualReview || (status !== null && WARN_STATES.has(status))
            ? "warn"
            : status !== null && ERROR_STATES.has(status)
              ? "error"
              : envelope.ok === false
                ? "error"
                : "ok";

      return {
        toolName,
        status,
        tone,
        summary: typeof envelope.summary === "string" && envelope.summary !== "" ? envelope.summary : null,
        rows: rowsOf(envelope.data),
        warnings: warnings.slice(0, MAX_WARNINGS),
        manualReview,
        raw,
      };
    }

    function firstLine(text) {
      const trimmed = typeof text === "string" ? text.trim() : "";
      const newline = trimmed.indexOf("\n");
      return newline === -1 ? trimmed : trimmed.slice(0, newline);
    }

    const TONE_TOKENS = {
      ok: "var(--dsw-alias-state-success-primary)",
      warn: "var(--dsw-alias-state-warn-primary)",
      error: "var(--dsw-alias-state-error-primary)",
      muted: "var(--dsw-alias-label-tertiary)",
    };

    /** The row component. Props come from the host's tool-call slot. */
    function WarpmetalRow(props) {
      const { toolName, block } = props ?? {};
      let projection;
      try {
        projection = projectWarpmetalResult(toolName, block);
      } catch {
        // A component that throws blanks the slot entry in the host, so even the
        // projection's own failure degrades to a single line.
        projection = {
          toolName,
          status: null,
          tone: "muted",
          summary: null,
          rows: [],
          warnings: [],
          manualReview: false,
          raw: "",
        };
      }

      const shortName = typeof toolName === "string" ? toolName.replace(TOOL_PREFIX, "") : "result";
      const tone = TONE_TOKENS[projection.tone] ?? TONE_TOKENS.muted;

      const header = h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--dsw-alias-label-secondary)",
          },
        },
        h("span", {
          "aria-hidden": true,
          style: {
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: tone,
            flex: "0 0 auto",
          },
        }),
        h("span", { style: { fontWeight: 600, color: "var(--dsw-alias-label-primary)" } }, "WarpMetal"),
        h("span", { style: { color: "var(--dsw-alias-label-tertiary)" } }, shortName),
        projection.status === null
          ? null
          : h("span", { style: { marginLeft: "auto", color: tone, fontVariant: "small-caps" } }, projection.status),
      );

      const children = [header];

      if (projection.summary !== null) {
        children.push(
          h(
            "div",
            { style: { fontSize: 13, color: "var(--dsw-alias-label-primary)", marginTop: 4 } },
            projection.summary,
          ),
        );
      }

      if (projection.rows.length > 0) {
        children.push(
          h(
            "ul",
            {
              style: {
                listStyle: "none",
                margin: "6px 0 0",
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              },
            },
            projection.rows.map((row, index) =>
              h(
                "li",
                {
                  key: row.id + ":" + index,
                  style: {
                    display: "flex",
                    gap: 8,
                    fontSize: 12,
                    color: "var(--dsw-alias-label-secondary)",
                  },
                },
                h(
                  "code",
                  {
                    style: {
                      fontFamily: "var(--dsw-font-markdown-code-font-family, ui-monospace, monospace)",
                      color: "var(--dsw-alias-label-primary)",
                    },
                  },
                  row.id,
                ),
                h("span", null, row.state === null ? "—" : row.state),
                row.note === null ? null : h("span", { style: { color: tone } }, row.note),
              ),
            ),
          ),
        );
      }

      for (const warning of projection.warnings) {
        children.push(
          h(
            "div",
            { style: { fontSize: 12, marginTop: 4, color: TONE_TOKENS.warn } },
            warning,
          ),
        );
      }

      if (projection.manualReview) {
        children.push(
          h(
            "div",
            {
              style: {
                fontSize: 12,
                marginTop: 4,
                fontWeight: 600,
                color: "var(--dsw-alias-state-warn-primary)",
              },
            },
            "manual_review",
          ),
        );
      }

      if (projection.raw !== "") {
        children.push(
          h(
            "details",
            { style: { marginTop: 6 } },
            h(
              "summary",
              {
                style: {
                  cursor: "pointer",
                  fontSize: 12,
                  color: "var(--dsw-alias-label-tertiary)",
                },
              },
              "result",
            ),
            h(
              "pre",
              {
                style: {
                  margin: "4px 0 0",
                  padding: 8,
                  overflowX: "auto",
                  fontSize: 11,
                  borderRadius: "var(--dsw-radius-sm, 6px)",
                  background: "var(--dsw-alias-markdown-code-block)",
                  color: "var(--dsw-alias-label-secondary)",
                },
              },
              projection.raw,
            ),
          ),
        );
      }

      return h(
        "div",
        {
          style: {
            border: "1px solid var(--dsw-alias-border-l2)",
            background: "var(--dsw-alias-bg-layer-1)",
            borderRadius: "var(--dsw-radius-md, 8px)",
            padding: "8px 10px",
          },
        },
        children,
      );
    }

    return {
      inject: ["slots"],
      /** Exposed for the offline tests; the host ignores extra members. */
      project: projectWarpmetalResult,
      CARDED_TOOLS,
      apply(ctx) {
        // One `inject` per tool, the shape the shipped template uses: the
        // registrations are disposed with the owning slot declaration.
        for (const toolName of CARDED_TOOLS) {
          ctx.slots.inject("tool.call.toolview", () =>
            ctx.slots.register({ name: "tool.call.toolview", key: toolName }, WarpmetalRow),
          );
        }
      },
    };
  },
});
