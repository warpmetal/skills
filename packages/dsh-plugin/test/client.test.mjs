import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import vm from "node:vm";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const source = await readFile(join(packageRoot, "client.js"), "utf8");

/** A React stand-in: the bundle only needs `createElement`. */
function reactStub() {
  const createElement = (type, props, ...children) => ({
    type,
    props: props ?? {},
    children: children.flat(Infinity).filter((child) => child !== null && child !== undefined),
  });
  return { createElement, Fragment: Symbol("Fragment") };
}

/**
 * Run the browser artifact the way the host does: a `window` with the module
 * loader, a `require` that answers for react, and the factory's return value.
 */
function loadBundle() {
  const captured = [];
  const window = { __ModuleLoader__: { load: (mod) => captured.push(mod) } };
  const react = reactStub();
  const require = (id) => {
    if (id === "react") return react;
    throw new Error(`unexpected require(${id})`);
  };
  vm.runInNewContext(source, { window, require, console });
  assert.equal(captured.length, 1, "the bundle must register exactly one module");
  const [module] = captured;
  return { module, plugin: module.factory(require) };
}

/** Collect every string a rendered tree contains, in order. */
function textOf(element) {
  if (element === null || element === undefined) return [];
  if (typeof element === "string" || typeof element === "number") return [String(element)];
  if (Array.isArray(element)) return element.flatMap(textOf);
  if (typeof element === "object") return textOf(element.children);
  return [];
}

/**
 * Values the bundle builds carry the vm realm's prototypes, so strict deep
 * equality would fail on identity rather than on content.
 */
const plain = (value) => JSON.parse(JSON.stringify(value));

function envelope(overrides = {}) {
  return {
    status: "OBSERVED",
    ok: true,
    summary: "3 server(s), 1 task(s)",
    exit_code: 0,
    data: { servers: [{ serverId: "srv_1", state: "READY" }, { serverId: "srv_2", state: "STOPPED" }] },
    warnings: [],
    errors: [],
    next_actions: [],
    redacted: [],
    ...overrides,
  };
}

function blockOf(value) {
  return { kind: "tool", isError: false, content: [{ type: "text", text: JSON.stringify(value) }] };
}

const { module: bundle, plugin } = loadBundle();

describe("browser artifact", () => {
  test("registers under the package name with a namespaced plugin", () => {
    assert.equal(bundle.id, "@warpmetal/dsh-plugin");
    assert.deepEqual([...plugin.inject], ["slots"]);
    assert.equal(typeof plugin.apply, "function");
    assert.equal(typeof plugin.project, "function");
  });

  test("cards a bounded set of WarpMetal tool names", () => {
    assert.equal(plugin.CARDED_TOOLS.length, 8);
    for (const name of plugin.CARDED_TOOLS) {
      assert.match(name, /^mcp__warpmetal__wm_[a-z_]+$/);
    }
  });
});

describe("slot registration", () => {
  test("replaces the generic row for each carded tool, one inject per tool", () => {
    const injects = [];
    const registrations = [];
    const ctx = {
      slots: {
        inject(name, callback) {
          injects.push(name);
          callback();
        },
        register(options, component) {
          registrations.push({ options, component });
          return () => {};
        },
      },
    };

    plugin.apply(ctx);

    const carded = Array.from(plugin.CARDED_TOOLS);
    assert.deepEqual(injects, carded.map(() => "tool.call.toolview"));
    assert.equal(registrations.length, carded.length);
    const registeredKeys = registrations.map((entry) => entry.options.key);
    assert.deepEqual(registeredKeys, carded);
    for (const entry of registrations) {
      assert.equal(entry.options.name, "tool.call.toolview");
      assert.equal(typeof entry.component, "function");
    }
  });
});

describe("result projection", () => {
  test("projects a collection into id/state rows", () => {
    const projection = plugin.project("mcp__warpmetal__wm_state_list", blockOf(envelope()));

    assert.equal(projection.status, "OBSERVED");
    assert.equal(projection.tone, "ok");
    assert.equal(projection.summary, "3 server(s), 1 task(s)");
    assert.deepEqual(plain(projection.rows), [
      { id: "srv_1", state: "READY", note: null },
      { id: "srv_2", state: "STOPPED", note: null },
    ]);
    assert.equal(projection.manualReview, false);
  });

  test("projects a single-object payload into one row", () => {
    const projection = plugin.project(
      "mcp__warpmetal__wm_server_get",
      blockOf(envelope({ data: { serverId: "srv_9", state: "READY" } })),
    );
    assert.deepEqual(plain(projection.rows), [{ id: "srv_9", state: "READY", note: null }]);
  });

  test("treats manual_review as a warning tone and a flag", () => {
    const projection = plugin.project(
      "mcp__warpmetal__wm_order_status",
      blockOf(envelope({ status: "MANUAL_REVIEW", ok: false, warnings: ["manual_review"] })),
    );
    assert.equal(projection.tone, "warn");
    assert.equal(projection.manualReview, true);
    assert.deepEqual(plain(projection.warnings), ["manual_review"]);
  });

  test("treats a failed envelope or an isError block as an error", () => {
    const failed = plugin.project(
      "mcp__warpmetal__wm_health",
      blockOf(envelope({ status: "FAILED", ok: false })),
    );
    assert.equal(failed.tone, "error");

    const isError = plugin.project("mcp__warpmetal__wm_health", {
      kind: "tool",
      isError: true,
      content: [{ type: "text", text: JSON.stringify(envelope({ status: "UNAVAILABLE" })) }],
    });
    assert.equal(isError.tone, "error");
  });

  test("degrades instead of throwing on an unreadable block", () => {
    for (const block of [null, undefined, {}, { content: [] }, { content: [{ type: "text", text: "boom\nrest" }] }]) {
      const projection = plugin.project("mcp__warpmetal__wm_state_list", block);
      assert.equal(projection.rows.length, 0);
      assert.equal(projection.manualReview, false);
      assert.equal(typeof projection.raw, "string");
    }
    const plain = plugin.project("mcp__warpmetal__wm_state_list", {
      content: [{ type: "text", text: "not json\nsecond line" }],
    });
    assert.equal(plain.summary, "not json");
  });

  test("bounds rows, warnings and the raw dump", () => {
    const servers = Array.from({ length: 40 }, (_, index) => ({
      serverId: `srv_${index}`,
      state: "READY",
    }));
    const projection = plugin.project(
      "mcp__warpmetal__wm_state_list",
      blockOf(envelope({ data: { servers }, warnings: ["a", "b", "c", "d"] })),
    );
    assert.equal(projection.rows.length, 20);
    assert.equal(projection.warnings.length, 3);

    const huge = { content: [{ type: "text", text: "x".repeat(9000) }] };
    const truncated = plugin.project("mcp__warpmetal__wm_state_list", huge);
    assert.ok(truncated.raw.length < 9000);
    assert.ok(truncated.raw.endsWith("…"));
  });
});

describe("row component", () => {
  const collect = (registrations, props) => registrations[0].component(props);

  function registrations() {
    const found = [];
    plugin.apply({
      slots: {
        inject: (_name, callback) => callback(),
        register: (options, component) => found.push({ options, component }),
      },
    });
    return found;
  }

  test("renders the brand, the tool and the summary", () => {
    const tree = collect(registrations(), {
      toolName: "mcp__warpmetal__wm_state_list",
      block: blockOf(envelope()),
    });
    const text = textOf(tree).join(" ");
    assert.match(text, /WarpMetal/);
    assert.match(text, /wm_state_list/);
    assert.match(text, /3 server\(s\), 1 task\(s\)/);
    assert.match(text, /srv_1/);
    assert.match(text, /OBSERVED/);
  });

  test("survives missing props and a broken block", () => {
    for (const props of [undefined, {}, { toolName: "mcp__warpmetal__wm_health" }, { toolName: 7, block: 42 }]) {
      assert.doesNotThrow(() => collect(registrations(), props));
    }
  });
});
