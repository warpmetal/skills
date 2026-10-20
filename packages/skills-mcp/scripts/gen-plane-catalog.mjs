/**
 * Generates `src/providers/catalog/plane.json` from the pinned inventory and the
 * reviewed allowlist.
 *
 * The catalog is what the MCP surface is built from: `registerProviderTools`
 * registers one tool per entry, and `gen-mapping.mjs` turns the same file into the
 * provider/verb mapping. An entry has to say three things and no less:
 *
 *   - the arguments, in snake_case, with the type the vendor's own tool declares;
 *   - the endpoint the tool calls, in the description, so a caller can check it
 *     against Plane's reference without reading this repository;
 *   - what the tool is for, which is the reviewed `reason` from the allowlist.
 *
 * One entry per allowlist entry, in allowlist order, with no invention: an
 * argument the vendor's action does not declare does not appear, and an argument
 * it requires is required here too. The endpoint half is shared with the CLI's
 * route generator - both import `packages/warpmetal-cli/scripts/plane/*` - so the
 * two artifacts cannot disagree about what an action is.
 *
 *   node packages/skills-mcp/scripts/gen-plane-catalog.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { argumentRoles, loadAllowlist } from "../../warpmetal-cli/scripts/plane/allowlist.mjs";
import { API_ORIGIN, ENDPOINTS } from "../../warpmetal-cli/scripts/plane/endpoints.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const outFile = join(here, "..", "src/providers/catalog/plane.json");
const inventoryFile = join(root, "packages/warpmetal-cli/scripts/plane/inventory.json");

const inventory = JSON.parse(readFileSync(inventoryFile, "utf8"));
const allowlist = loadAllowlist(join(root, "packages/warpmetal-cli/scripts/plane/allowlist.json"), inventory, ENDPOINTS);

if (allowlist.problems.length > 0) {
  console.error(`${allowlist.problems.length} problem(s) in the Plane allowlist:`);
  for (const problem of allowlist.problems) console.error(`  ${problem}`);
  process.exit(1);
}

/**
 * The Python type the vendor's tool declares for an argument, where it is not a
 * string.
 *
 * The inventory records argument names, not annotations, so this is the reviewed
 * translation of the signatures the vendor's modules carry (`per_page: int = 0`,
 * `archived: bool = False`, `is_active: bool | None = None`). Everything absent
 * here is a string, which is what most Plane arguments are - including ids, dates
 * and the JSON strings some tools accept (`options`, `points`).
 */
const TYPES = new Map([
  ...["archive", "archive_pages", "archived", "customers", "cycles", "default", "epics", "initiatives", "intakes", "is_active", "is_bot", "is_default", "is_dependency", "is_draft", "is_locked", "is_multi", "is_prerelease", "is_required", "is_time_tracking_enabled", "last_used", "modules", "pages", "parallel_cycles", "pi", "project_grouping", "project_updates", "teams", "views", "wiki", "workflows", "workitem_types"].map((name) => [name, "boolean"]),
  ...["archive_in", "close_in", "duration", "employees", "key", "network", "per_page", "point", "status"].map((name) => [name, "integer"]),
  ...["sequence", "sort_order"].map((name) => [name, "number"]),
  ["value", "any"],
  ["assignees", "array"],
  ["labels", "array"],
  ["workitem_ids", "array"],
]);

/** The type of one argument, as the catalog's JSON Schema spells it. */
function typeOf(name) {
  return TYPES.get(name) ?? "string";
}

/** The verb the title starts with, by the action it names. */
const VERBS = {
  list: "List",
  retrieve: "Get",
  search: "Search",
  search_pages: "Search",
  retrieve_by_identifier: "Get",
  retrieve_option: "Get",
  get_features: "Get",
  get_changelog: "Get",
  get_value: "Get",
  list_workspace: "List",
  list_project: "List",
  list_roles: "List",
  list_workitems: "List",
  list_workitem_pages: "List",
  list_pages: "List",
  list_members: "List",
  list_points: "List",
  worklog_summary: "Read",
};

/** Titles that are not "verb + subject", because the verb is not the point. */
const TITLES = {
  me: "Who Am I",
};

/** What the action narrows the tool's subject to, in a title's parentheses. */
const SUBJECTS = {
  list_workspace: "workspace",
  list_project: "project",
  list_roles: "role catalogue",
  list_workitems: "work items",
  list_workitem_pages: "pages",
  list_pages: "pages",
  list_members: "members",
  list_points: "points",
  retrieve_by_identifier: "by identifier",
  retrieve_option: "option",
  get_features: "features",
  get_changelog: "changelog",
  get_value: "value",
  worklog_summary: "worklog summary",
};

/** The title case the rest of the catalog uses: every word, but not `a`/`of`. */
const SMALL = new Set(["a", "an", "of", "the", "and", "in", "to"]);
function titleCase(text) {
  return text
    .split(" ")
    .map((word, index) =>
      index > 0 && SMALL.has(word.toLowerCase()) ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

function titleOf(entry) {
  const name = entry.action.name;
  if (TITLES[name] !== undefined) return TITLES[name];
  const verb = VERBS[name] ?? "Read";
  const subject = SUBJECTS[name];
  const subjectTitle = titleCase(entry.action.title);
  return subject === undefined ? `${verb} ${subjectTitle}` : `${verb} ${subjectTitle} (${subject})`;
}

/**
 * The description: what the tool is for, the exact endpoint, and the caveats a
 * caller would otherwise discover by being refused. A caller should be able to
 * check every sentence against Plane's reference or the vendor's own tool.
 */
function descriptionOf(entry) {
  const { query, paths, chosenBy } = argumentRoles(entry);
  const parts = [entry.reason.endsWith(".") ? entry.reason : `${entry.reason}.`];
  parts.push(`${endpointMethod(entry)} ${paths.join(" | ")}.`);
  if (entry.action.note) {
    // The vendor's own sentence for the action, quoted so a reader knows which
    // claims are theirs and which are ours.
    const note = entry.action.note.trim().replace(/\.?$/, ".");
    parts.push(`The vendor's own note: ${note}`);
  }
  if (entry.endpoint.note) parts.push(entry.endpoint.note.endsWith(".") ? entry.endpoint.note : `${entry.endpoint.note}.`);
  if (query === "args" || Array.isArray(query)) {
    if (Array.isArray(query) ? query.length > 0 : query === "args") {
      parts.push("Filters you leave out are left out of the request rather than sent empty.");
    }
  }
  if ((entry.action.optional ?? []).includes("pql")) {
    parts.push("`pql` is Plane's own query language for filtering and grouping.");
  }
  if (chosenBy !== undefined) {
    parts.push(
      `\`${chosenBy}\` chooses the endpoint: ${Object.keys(entry.endpoint.path.cases).join(" or ")}.`,
    );
  }
  for (const name of entry.endpoint.requireArgs ?? []) {
    parts.push(
      `\`${name}\` is required: this tool is the ${name.replace(/_id$/, "")}-scoped branch of the vendor's action, ` +
        "and the branch without it is not exposed.",
    );
  }
  if (entry.wave === "p2") parts.push("It writes, so it asks for confirmation first.");
  return parts.join(" ");
}

function endpointMethod(entry) {
  const method = entry.endpoint.method;
  return typeof method === "string" ? method : Object.values(method.cases).map((variant) => variant.method).join("/");
}

/** The argument schema: the vendor's arguments, with the role each one plays. */
function inputSchemaOf(entry) {
  const { declared, placeholders, queries, bodyArgs } = argumentRoles(entry);
  const required = new Set(entry.action.requires ?? []);
  const properties = {};
  for (const name of [...declared].sort()) {
    const role = placeholders.has(name)
      ? "Path parameter."
      : queries.includes(name)
        ? "Query parameter."
        : bodyArgs.includes(name)
          ? "Body field."
          : "Chooses the endpoint.";
    const type = typeOf(name);
    properties[name] = {
      type,
      // `value` is the one argument Plane types per property (`str | bool | int |
      // float | list[str]`), so the schema says `any` rather than lying about it.
      ...(type === "any" ? { type: undefined } : {}),
      ...(type === "array" ? { items: { type: "string" } } : {}),
      description: `${role} ${name}${name === "pql" ? " (Plane Query Language)" : ""}.`,
    };
    if (properties[name].type === undefined) delete properties[name].type;
  }
  return {
    additionalProperties: false,
    properties,
    ...(required.size > 0 ? { required: [...required].sort() } : {}),
    type: "object",
  };
}

const problems = [];
const tools = allowlist.entries.map((entry) => {
  const title = titleOf(entry);
  const description = descriptionOf(entry);
  if (description.length <= 10) problems.push(`${entry.toolSlug}: description is too short to be useful`);
  const method = endpointMethod(entry);
  return {
    toolSlug: entry.toolSlug,
    name: entry.toolSlug.replace(/^plane_/, ""),
    title,
    description,
    toolkitId: "plane",
    version: entry.action.read ? "v1-read" : "v1-write",
    inputSchema: inputSchemaOf(entry),
    outputSchema: { additionalProperties: true, type: "object" },
    annotations: {
      title,
      readOnlyHint: entry.action.read === true,
      // A GET, a PUT and a DELETE reach the same state whether they run once or
      // five times; a POST and a PATCH do not. The table's method decides.
      idempotentHint: entry.action.read === true || ["GET", "PUT", "DELETE"].includes(method),
      openWorldHint: true,
      // Must match `src/providers/destructive.ts` exactly: providers.test.ts
      // asserts the registered annotation equals membership in that set.
      destructiveHint: entry.destructive === true,
    },
  };
});

if (problems.length > 0) {
  console.error(`${problems.length} problem(s) building the catalog:`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

const document = {
  version: 1,
  provider: "plane",
  source: "warpmetal-providers",
  extractedAt: (inventory.source.publishedAt ?? "").slice(0, 10),
  inventory: {
    repository: inventory.source.repository,
    tag: inventory.source.tag,
    license: inventory.source.license,
    actions: inventory.counts.actions,
    tools: inventory.counts.tools,
  },
  sdk: "plane-sdk==0.3.1",
  origin: API_ORIGIN,
  tools,
};

const serialized = `${JSON.stringify(document, null, 2)}\n`;

if (process.argv.includes("--check")) {
  let current = null;
  try {
    current = readFileSync(outFile, "utf8");
  } catch {
    current = null;
  }
  if (current !== serialized) {
    console.error(`${outFile} is out of date`);
    console.error("re-run: node packages/skills-mcp/scripts/gen-plane-catalog.mjs");
    process.exit(1);
  }
  console.log("the plane catalog is up to date");
  process.exit(0);
}

writeFileSync(outFile, serialized);
console.log(`wrote ${tools.length} plane tool(s) to ${outFile}`);

