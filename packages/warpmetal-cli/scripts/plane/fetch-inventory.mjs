#!/usr/bin/env node
/**
 * Pins the tool surface of Plane's own MCP server, and holds it still.
 *
 * Every other provider in this repository is generated from a document the
 * vendor publishes: an OpenAPI file with a `spec.sha256` beside it. Plane
 * publishes no such document - `https://api.plane.so/api/schema/?format=openapi-json`
 * answers 404, and the schema that renders the docs site is served from the docs
 * host only - so the equivalent, reviewable pin for Plane is its MCP server's
 * source: one module per resource whose `ACTIONS` tuple is, by the vendor's own
 * design, the contract behind the descriptions, the annotations and the argument
 * validation (`plane_mcp/toolkit/spec.py`, held there by `test_conformance.py`).
 *
 * This script downloads that source at a pinned release tag, records a sha256
 * for every file, and derives a structured `inventory.json` from it:
 *
 *     node fetch-inventory.mjs --update    # pin (or re-pin) a release
 *     node fetch-inventory.mjs --check     # prove the pin still holds
 *
 * `--check` re-derives the inventory and compares it against the committed file,
 * so an inventory that was edited by hand fails as loudly as one whose upstream
 * moved. It reads the cache downloaded by `--update` when one is present, and
 * fetches the same tag otherwise - add `--offline` to refuse the network.
 *
 * Nothing here decides what our surface should look like; that is
 * `allowlist.json`. This file only says what the vendor's surface *is*, and
 * refuses to say anything it could not read.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PythonLiteError, readDispatcherShapes, readModule } from "./python-lite.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const INVENTORY_FILE = join(HERE, "inventory.json");
const TOOL_MODULES = "plane_mcp/tools";

/** The release this inventory is pinned to. Moving it is a reviewed change. */
const TAG = "v0.3.4";
const REPOSITORY = "https://github.com/makeplane/plane-mcp-server";
const CACHE_ROOT = join(HERE, ".cache", `plane-mcp-${TAG}`);

const SOURCE = {
  repository: REPOSITORY,
  tag: TAG,
  license: "MIT",
  tree: `https://api.github.com/repos/makeplane/plane-mcp-server/git/trees/${TAG}?recursive=1`,
  raw: `https://raw.githubusercontent.com/makeplane/plane-mcp-server/${TAG}/`,
};

/**
 * Fields `--update` writes but `--check` does not compare.
 *
 * `publishedAt` comes from the release API, which a cache-only check cannot
 * reach; comparing it would make an offline check fail for a reason that has
 * nothing to do with the pin.
 */
const RELEASE_METADATA = ["publishedAt"];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function parseArgs(argv) {
  const args = { update: false, check: false, offline: false };
  for (const arg of argv) {
    if (arg === "--update") args.update = true;
    else if (arg === "--check") args.check = true;
    else if (arg === "--offline") args.offline = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!args.update && !args.check) args.check = true;
  if (args.update && args.check) args.check = false;
  return args;
}

async function fetchSourceTree() {
  const response = await fetch(SOURCE.tree, { headers: { "user-agent": "warpmetal-inventory" } });
  if (!response.ok) throw new Error(`tree listing failed: ${response.status} ${response.statusText}`);
  const body = await response.json();
  return body.tree.filter((entry) => entry.type === "blob" && entry.path.startsWith("plane_mcp/"));
}

async function downloadRelease({ offline }) {
  if (offline) throw new Error("no cached copy of the pinned release; re-run without --offline");
  const tree = await fetchSourceTree();
  const entries = [];
  for (const entry of tree) {
    const response = await fetch(`${SOURCE.raw}${entry.path}`, { headers: { "user-agent": "warpmetal-inventory" } });
    if (!response.ok) throw new Error(`${entry.path}: ${response.status} ${response.statusText}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const target = join(CACHE_ROOT, ...entry.path.split("/"));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    entries.push({ path: entry.path, sha256: sha256(bytes), bytes: bytes.length });
  }
  return entries;
}

/**
 * Every cached file, in path order.
 *
 * `--check` prefers the cache and falls back to the network, so this is the
 * offline path: a path list is all that is needed to re-verify a pin, and the
 * digests recorded beside it are what make a mismatch visible.
 */
function cachedPaths() {
  const paths = [];
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`);
      else paths.push(`${prefix}${entry.name}`);
    }
  };
  walk(CACHE_ROOT, "");
  return paths.sort();
}

/**
 * The advertised order, read off `registry.py`'s `RESOURCES` tuple.
 *
 * That order is a wire-format guarantee in the vendor's own words - tool
 * definitions head a client's prompt cache - so recording it is the point of
 * reading this file rather than sorting the modules ourselves. `RESOURCES` holds
 * identifiers, not strings, so this reads the tuple as text instead of
 * evaluating it.
 */
export function readResourceOrder(registrySource) {
  const match = /^RESOURCES[^\n=]*= \(([\s\S]*?)^\)/m.exec(registrySource);
  if (match === null) throw new Error("registry.py: the RESOURCES tuple was not found");
  const names = match[1]
    .split("\n")
    .map((line) => line.trim().replace(/,$/, ""))
    .filter((line) => /^[a-z_0-9]+$/.test(line));
  if (names.length === 0) throw new Error("registry.py: the RESOURCES tuple is empty");
  return names;
}

/** Tool entries, in advertised order, with each action's request shape joined in. */
function deriveTools(read) {
  const registryPath = `${TOOL_MODULES}/registry.py`;
  const order = readResourceOrder(read(registryPath).toString("utf8"));
  return order.map((resource) => {
    const path = `${TOOL_MODULES}/${resource}.py`;
    const source = read(path).toString("utf8");
    let module;
    try {
      module = readModule(source, path);
    } catch (error) {
      if (error instanceof PythonLiteError) throw new PythonLiteError(`${path}: ${error.message}`);
      throw error;
    }
    if (module.name !== resource) {
      throw new Error(`${path}: NAME is "${module.name}" but registry.py registers "${resource}"`);
    }
    const shapes = readDispatcherShapes(source);
    const actions = module.actions.map((action) => {
      if (shapes === null) {
        // No dispatch and no SDK call anywhere: the tool answers from its own text.
        return {
          ...action,
          requestLines: 0,
          loops: false,
          branch: "no-action-parameter",
          requestShape: "none",
        };
      }
      return {
        ...action,
        ...(shapes[action.name] ?? shapes["*"] ?? {
          requestLines: 0,
          loops: false,
          branch: "unreachable",
          requestShape: "unknown",
        }),
      };
    });
    const unreachable = actions.filter((action) => action.requestShape === "unknown").map((action) => action.name);
    return {
      tool: resource,
      title: module.title,
      module: path,
      actions,
      legacy: module.legacy,
      legacyUnmapped: module.legacyUnmapped,
      ...(unreachable.length > 0 ? { actionsWithoutDispatcher: unreachable } : {}),
    };
  });
}

function tallyByRequestShape(actions) {
  const tally = { single: 0, multi: 0, none: 0, unknown: 0 };
  for (const action of actions) tally[action.requestShape] += 1;
  return tally;
}

function summarize(tools) {
  const actions = tools.flatMap((tool) => tool.actions);
  const count = (pick) => actions.filter(pick).length;
  const legacy = tools.reduce((total, tool) => total + Object.keys(tool.legacy).length, 0);
  const legacyUnmapped = tools.reduce((total, tool) => total + Object.keys(tool.legacyUnmapped).length, 0);
  return {
    tools: tools.length,
    actions: actions.length,
    read: count((action) => action.read),
    destructive: count((action) => action.destructive),
    openWorld: count((action) => action.openWorld),
    shapes: tallyByRequestShape(actions),
    legacy,
    legacyUnmapped,
  };
}

/**
 * What the pinned package says about itself.
 *
 * The README's counts and its per-tool action table are an independent
 * restatement of `ACTIONS`, written by hand and maintained by the vendor. If the
 * derived inventory and that table disagree, one of the two readers is wrong, and
 * the reader is more likely to be this one - so the disagreement is an error
 * rather than a footnote.
 */
export function readmeExpectations(source) {
  const tools = /(\d+) tools\b/.exec(source);
  const actions = /(\d+) actions in total/.exec(source);
  const table = new Map();
  for (const line of source.split("\n")) {
    const row = /^\|\s*`([a-z_0-9]+)`\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
    if (row === null) continue;
    table.set(row[1], [...row[2].matchAll(/`([a-z_0-9]+)`/g)].map((match) => match[1]));
  }
  return {
    tools: tools === null ? null : Number(tools[1]),
    actions: actions === null ? null : Number(actions[1]),
    table,
  };
}

/**
 * Tools the vendor's README lists without actions.
 *
 * `get_pql_reference` declares a single `read` action whose own note says the
 * tool has no `action` parameter, and the README's table agrees by listing none.
 * Its row is therefore excluded from the name comparison rather than read as a
 * disagreement; its actions still count towards the totals below.
 */
const ACTIONLESS_TOOLS = new Set(["get_pql_reference"]);

/** Every disagreement between the derived inventory and the package's README. */
function crossCheck(tools, summary, readme) {
  const problems = [];
  if (readme.tools !== null && readme.tools !== summary.tools) {
    problems.push(`tools: README says ${readme.tools}, derived ${summary.tools}`);
  }
  if (readme.actions !== null && readme.actions !== summary.actions) {
    problems.push(`actions: README says ${readme.actions}, derived ${summary.actions}`);
  }
  for (const tool of tools) {
    if (ACTIONLESS_TOOLS.has(tool.tool)) continue;
    const documented = readme.table.get(tool.tool);
    if (documented === undefined) {
      problems.push(`${tool.tool}: absent from the README's tool table`);
      continue;
    }
    const derived = tool.actions.map((action) => action.name);
    const missing = derived.filter((name) => !documented.includes(name));
    const extra = documented.filter((name) => !derived.includes(name));
    if (missing.length > 0) problems.push(`${tool.tool}: derived but not documented: ${missing.join(", ")}`);
    if (extra.length > 0) problems.push(`${tool.tool}: documented but not derived: ${extra.join(", ")}`);
    if (missing.length === 0 && extra.length === 0 && derived.join() !== documented.join()) {
      problems.push(`${tool.tool}: same actions in a different order`);
    }
  }
  const readmeTools = [...readme.table.keys()].filter((tool) => !tools.some((entry) => entry.tool === tool));
  for (const tool of readmeTools) problems.push(`${tool}: documented but not registered`);
  for (const tool of tools) {
    if (tool.actionsWithoutDispatcher !== undefined) {
      problems.push(
        `${tool.tool}: declared but unreachable in the dispatch: ${tool.actionsWithoutDispatcher.join(", ")}`,
      );
    }
  }
  return problems;
}

function buildInventory({ sources, tools, summary, publishedAt }) {
  return {
    version: 1,
    note:
      "Generated from the pinned release of Plane's MCP server by fetch-inventory.mjs. " +
      "Each request shape is a source heuristic (see python-lite.mjs) and each action " +
      "carries the line it was declared on, so a reviewer can check it against the module.",
    source: {
      repository: SOURCE.repository,
      tag: SOURCE.tag,
      license: SOURCE.license,
      publishedAt,
    },
    sources,
    counts: summary,
    tools,
  };
}

/** The inventory without release metadata, which a cache-only check cannot verify. */
function comparable(inventory) {
  const source = { ...inventory.source };
  for (const field of RELEASE_METADATA) delete source[field];
  return {
    version: inventory.version,
    source,
    sources: inventory.sources,
    counts: inventory.counts,
    tools: inventory.tools,
  };
}

/** The first difference between two parsed inventories, as a report line. */
function firstDifference(left, right, path = "inventory") {
  if (typeof left !== typeof right || left === null || right === null || typeof left !== "object") {
    return left === right ? null : `${path}: ${JSON.stringify(left)} -> ${JSON.stringify(right)}`;
  }
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];
  for (const key of keys) {
    const where = Array.isArray(left) ? `${path}[${key}]` : `${path}.${key}`;
    const difference = firstDifference(left[key], right[key], where);
    if (difference !== null) return difference;
  }
  return null;
}

async function fetchPublishedAt() {
  try {
    const url = `https://api.github.com/repos/makeplane/plane-mcp-server/releases/tags/${TAG}`;
    const response = await fetch(url, { headers: { "user-agent": "warpmetal-inventory" } });
    if (!response.ok) return null;
    const body = await response.json();
    return typeof body.published_at === "string" ? body.published_at : null;
  } catch {
    return null;
  }
}

/**
 * The human summary: the numbers, and every action that is not one request.
 *
 * The second half is the part that decides the shape of our allowlist, so it is
 * printed rather than left for the reader to dig out of the JSON.
 */
function report(summary, tools) {
  const lines = [
    `  tools      ${summary.tools}`,
    `  actions    ${summary.actions}  (read ${summary.read}, destructive ${summary.destructive}, open-world ${summary.openWorld})`,
    `  requests   single ${summary.shapes.single}, multi ${summary.shapes.multi}, none ${summary.shapes.none}, unknown ${summary.shapes.unknown}`,
    `  retired    ${summary.legacy} aliased, ${summary.legacyUnmapped} unmapped`,
  ];
  const shaped = tools.filter((tool) => tool.actions.some((action) => action.requestShape !== "single"));
  if (shaped.length > 0) {
    lines.push("", "  actions that are not a single request:");
    for (const tool of shaped) {
      const described = tool.actions
        .filter((action) => action.requestShape !== "single")
        .map((action) => `${action.name} (${action.requestShape}, ${action.requestLines} lines${action.loops ? ", loop" : ""})`);
      lines.push(`    ${tool.tool}: ${described.join(", ")}`);
    }
  }
  const indirect = tools.flatMap((tool) =>
    tool.actions
      .filter((action) => action.branch !== "own")
      .map((action) => `${tool.tool}.${action.name} (${action.branch}, ${action.requestLines} lines)`),
  );
  if (indirect.length > 0) {
    lines.push("", "  actions not dispatched by their own branch (verify by hand):");
    for (const entry of indirect) lines.push(`    ${entry}`);
  }
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("usage: node fetch-inventory.mjs [--update | --check] [--offline]");
    return;
  }
  let sources;
  if (existsSync(CACHE_ROOT) && !args.update) {
    sources = cachedPaths().map((path) => {
      const bytes = readFileSync(join(CACHE_ROOT, ...path.split("/")));
      return { path, sha256: sha256(bytes), bytes: bytes.length };
    });
    console.log(`reading the cached copy of ${SOURCE.tag} (${sources.length} files)`);
  } else {
    sources = await downloadRelease(args);
    console.log(`downloaded ${SOURCE.tag} (${sources.length} files)`);
  }
  const read = (path) => readFileSync(join(CACHE_ROOT, ...path.split("/")));
  const tools = deriveTools(read);
  const summary = summarize(tools);
  const readme = readmeExpectations(read(`${TOOL_MODULES}/README.md`).toString("utf8"));

  const problems = crossCheck(tools, summary, readme);
  if (problems.length > 0) {
    console.error("error: the derived inventory disagrees with the pinned release's README:");
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error("  Fix the reader rather than adjusting the numbers.");
    process.exitCode = 1;
    return;
  }

  if (args.update) {
    const publishedAt = await fetchPublishedAt();
    const inventory = buildInventory({ sources, tools, summary, publishedAt });
    writeFileSync(INVENTORY_FILE, `${JSON.stringify(inventory, null, 2)}\n`);
    console.log(`${SOURCE.repository} ${SOURCE.tag} (${SOURCE.license})`);
    console.log(report(summary, tools));
    console.log(`\nwrote ${INVENTORY_FILE}`);
    return;
  }

  if (!existsSync(INVENTORY_FILE)) {
    console.error("error: inventory.json is missing; run with --update to pin the release");
    process.exitCode = 1;
    return;
  }
  const committed = JSON.parse(readFileSync(INVENTORY_FILE, "utf8"));
  const digests = new Map(sources.map((source) => [source.path, source]));
  const drifted = [];
  for (const pinned of committed.sources) {
    const actual = digests.get(pinned.path);
    if (actual === undefined) drifted.push(`${pinned.path}: missing from the pinned release`);
    else if (actual.sha256 !== pinned.sha256) {
      drifted.push(`${pinned.path}: sha256 ${pinned.sha256.slice(0, 12)} -> ${actual.sha256.slice(0, 12)}`);
    }
    digests.delete(pinned.path);
  }
  for (const path of digests.keys()) drifted.push(`${path}: present upstream but not in inventory.json`);
  if (drifted.length > 0) {
    console.error(`error: ${SOURCE.tag} no longer matches inventory.json:`);
    for (const entry of drifted) console.error(`  - ${entry}`);
    console.error("  Re-pin deliberately: review the change, then run with --update.");
    process.exitCode = 1;
    return;
  }
  const derived = buildInventory({ sources, tools, summary, publishedAt: null });
  const difference = firstDifference(comparable(derived), comparable(committed));
  if (difference !== null) {
    console.error(`error: inventory.json does not match the pinned release: ${difference}`);
    console.error("  Regenerate it with --update rather than editing it by hand.");
    process.exitCode = 1;
    return;
  }
  console.log(`${SOURCE.repository} ${SOURCE.tag} ${committed.source.publishedAt ?? ""}`.trim());
  console.log(report(summary, tools));
  console.log("\ninventory.json matches the pinned release");
}

await main().catch((error) => {
  console.error(`error: ${error.message}`);
  process.exitCode = 1;
});
