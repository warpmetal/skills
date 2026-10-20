/**
 * The pinned Python SDK, as the call sites the endpoint table names.
 *
 * `endpoints.mjs` records, for every shipped tool, the request it sends: a verb and an
 * API-relative path. Those were read from the SDK release the pinned MCP server pins
 * (`plane-sdk==0.3.1`, see `fetch-sdk.mjs`), because Plane publishes no OpenAPI
 * document. Until now that claim rested on a comment; this reader is what checks it.
 * It turns the pinned source into `call site -> { verb, path }`, so a reviewed entry
 * can be held against the module it says it came from.
 *
 * The names come from the source itself: `plane/client/plane_client.py` assigns each
 * top-level resource (`self.pages = Pages(self.config)`), a resource assigns its
 * sub-resources in its own `__init__` (`self.pages = WorkItemPages(config)`), and a
 * method's HTTP helper call carries the verb and the path. Nothing here is a
 * hand-written table, which is the whole point - a hand-written table is the thing
 * that drifts from the SDK.
 *
 * Two things make the comparison less direct than it looks, and both are handled
 * explicitly rather than papered over:
 *
 *   - an action often names a *local alias*, not a client member -
 *     `updater = client.pages.update_project_page if project_id else
 *     client.pages.update_workspace_page` - so the alias is resolved from the tool
 *     module's own text, and it resolves to *both* members. An action that forks like
 *     that is a decision for the endpoint table to record, not for this reader to
 *     hide;
 *   - on the other side, the SDK names a path parameter as the SDK API does
 *     (`work_item_id`) while the MCP argument is the vendor's tool argument
 *     (`workitem_id`), so paths are compared as *skeletons* - every `{placeholder}`
 *     becomes `{}` - which keeps the segments and the placeholder count in the
 *     comparison and leaves argument naming to the argument-role rules the allowlist
 *     already enforces;
 *   - the SDK has two trees and only one of them is read. Every member the table names
 *     lives in `plane/api/*.py`, where a method carries its verb and path as string
 *     literals. The other tree, `plane/api/v2/`, reaches its resources through a kernel
 *     and a per-resource `operations` table: its classes are counted and set aside
 *     rather than half-read, so a call site that lands there is reported as out of scope
 *     instead of resolved from a guess.
 *
 * `resolveRecorded` is the entry point for a call site as the pin records it - qualified
 * (`client.work_items.pages.create`) or bound to a local name (`namespace.list`) - and
 * returns the requests this reader derives for it.
 *
 * Two shapes in the pin write a request without an HTTP helper call, and both come back
 * as "declares no request" rather than as a guess:
 *
 *   - a method that delegates to a sibling resource - `Estimates.link_to_project` builds
 *     `Projects(self.config)` and returns `projects_client.update(...)`, so the request
 *     belongs to `Projects.update`, not to the method the tool called;
 *   - a method that talks to `self.session` itself with a URL it built -
 *     `WorkItemAttachments.get_download_url` does, to read a redirect's `Location`.
 *
 * Neither is named by a shipped entry today, and a tool whose request cannot be derived
 * is a tool this comparison cannot claim to have checked - which is the whole point.
 *
 * Anything it cannot read by those rules is an error naming the call site: a call site
 * this reader silently skipped would be a path nobody checked.
 *
 *     node scripts/plane/sdk-index.mjs client.work_items.pages.create
 */
import { pathToFileURL } from "node:url";

import { readPinnedSdk } from "./fetch-sdk.mjs";

/** What the SDK's HTTP helpers stand for. */
const VERBS = { _get: "GET", _post: "POST", _put: "PUT", _patch: "PATCH", _delete: "DELETE" };

/** The SDK's v2 modules, which this reader does not read (see the note in the header). */
const V2_ROOT = "plane/api/v2/";

/** A string literal at `i`, as `{ content, end }`, or null when there is none. */
function readLiteral(source, i) {
  let j = i;
  while (j < source.length && j - i < 3 && "rRbBuUfF".includes(source[j])) j += 1;
  const quote = source[j];
  if (quote !== '"' && quote !== "'") return null;
  const triple = source.slice(j, j + 3) === quote.repeat(3);
  let k = j + (triple ? 3 : 1);
  let content = "";
  while (k < source.length) {
    if (source[k] === "\\") {
      content += source[k + 1] ?? "";
      k += 2;
      continue;
    }
    if (source[k] === quote) {
      if (!triple) return { content, end: k + 1 };
      if (source.slice(k, k + 3) === quote.repeat(3)) return { content, end: k + 3 };
    }
    content += source[k];
    k += 1;
  }
  throw new Error("an unterminated string literal is not a path");
}

/**
 * The path an argument expression spells, or an error saying why it is not a path.
 *
 * Only string literals and whitespace may appear. A path assembled from a variable is
 * not a path this reader can hold anyone to, and guessing at one is exactly the
 * failure this reader exists to prevent.
 */
function literalPath(expression, context) {
  let path = "";
  let i = 0;
  while (i < expression.length) {
    if (/\s/.test(expression[i])) {
      i += 1;
      continue;
    }
    const literal = readLiteral(expression, i);
    if (literal === null) {
      throw new Error(`${context}: the path is built from ${JSON.stringify(expression.trim())}, not a literal`);
    }
    path += literal.content;
    i = literal.end;
  }
  return path;
}

/** The text of a call's first argument, from the index of its `(`. */
function firstArgument(source, open) {
  let depth = 0;
  let i = open + 1;
  const start = i;
  while (i < source.length) {
    const char = source[i];
    const literal = char === '"' || char === "'" ? readLiteral(source, i) : null;
    if (literal !== null) {
      i = literal.end;
      continue;
    }
    if ("([{".includes(char)) depth += 1;
    else if (")]}".includes(char)) {
      if (depth === 0) return source.slice(start, i);
      depth -= 1;
    } else if (char === "," && depth === 0) return source.slice(start, i);
    i += 1;
  }
  throw new Error("an unterminated call is not a path");
}

/** Every `{placeholder}` collapsed, for comparing two spellings of one path. */
export function skeleton(path) {
  return String(path).replace(/\{[a-z_0-9]+\}/g, "{}");
}

/**
 * A path in the form `endpoints.mjs` records it: API-relative, and with the workspace
 * placeholder named for the secret the route builder fills it from rather than for
 * the SDK's own parameter.
 */
export function toReviewedPath(path) {
  return String(path).replace(/\{workspace_slug\}/g, "{workspace}");
}

/**
 * A path as the reviewed table spells it, for comparing the two.
 *
 * The SDK appends a trailing slash to every URL and the route generator adds the same
 * slash back, so the table records the path without it - the two spellings are one
 * route. `skeleton()` then settles the last difference: the SDK names a path parameter
 * for its own API (`workitem_id`) while the table names the argument the caller passes,
 * so placeholders are compared as positions rather than as names.
 */
export function comparablePath(path) {
  return skeleton(toReviewedPath(path).replace(/\/+$/g, ""));
}

/** The class blocks of a module, as `{ match, start, end }`, in source order. */
function blocks(source, pattern, from = 0, to = source.length) {
  const limits = [...source.slice(from, to).matchAll(pattern)].map((match) => ({
    match,
    start: from + match.index,
  }));
  return limits.map((limit, index) => ({
    match: limit.match,
    start: limit.start,
    end: index + 1 < limits.length ? limits[index + 1].start : to,
  }));
}

/** The pin's classes, the client's top-level attributes, and each method's calls. */
export function buildSdkIndex(files) {
  const classes = new Map();
  const v2 = new Set();
  for (const [file, source] of files) {
    if (file.startsWith(V2_ROOT)) {
      // The v2 tree reaches its resources through a kernel and a per-resource
      // `operations` table, not through paths on the class, so this reader cannot hold a
      // call site in that tree to anything. The pin has no such call site, and one that
      // appears gets named as out of scope rather than resolved from a guess.
      // Name-only on purpose: this tree declares both `class X(Base):` and `class X:`,
      // and a name is all this set is for - it answers "is this class in the tree this
      // reader does not read?". A name the v1 tree declares too is resolved from the v1
      // tree first, which is what makes the broader match safe.
      for (const block of blocks(source, /^class[ \t]+([A-Za-z_0-9]+)/gm)) v2.add(block.match[1]);
      continue;
    }
    if (!file.startsWith("plane/api/") || !file.endsWith(".py")) continue;
    for (const block of blocks(source, /^class[ \t]+([A-Za-z_0-9]+)\(([^)]*)\)[ \t]*:/gm)) {
      const name = block.match[1];
      const body = source.slice(block.start, block.end);
      const basePath = /super\(\)\.__init__\(config,[ \t]*"([^"]*)"\)/.exec(body)?.[1] ?? null;
      const nested = new Map();
      const nestedPattern = /^ {4,}self\.([a-z_0-9]+)[ \t]*=[ \t]*([A-Z][A-Za-z_0-9]*)\((?:config|transport)\)/gm;
      for (const found of body.matchAll(nestedPattern)) nested.set(found[1], found[2]);

      const methods = new Map();
      for (const method of blocks(body, /^ {4}def[ \t]+([A-Za-z_0-9]+)\(/gm)) {
        const methodName = method.match[1];
        const methodBody = body.slice(method.start, method.end);
        const calls = [];
        for (const helper of methodBody.matchAll(/self\._(get|post|put|patch|delete)\(/g)) {
          const context = `${file}: ${name}.${methodName}`;
          if (basePath === null) throw new Error(`${context}: the class declares no base path`);
          const endpoint = literalPath(
            firstArgument(methodBody, helper.index + helper[0].length - 1),
            context,
          );
          const call = {
            method: VERBS[`_${helper[1]}`],
            path: toReviewedPath(`${basePath.replace(/\/+$/g, "")}/${endpoint.replace(/^\/+/g, "")}`),
          };
          const duplicate = calls.some((other) => other.method === call.method && other.path === call.path);
          if (!duplicate) calls.push(call);
        }
        if (calls.length > 0) methods.set(methodName, calls);
      }
      classes.set(name, { name, file, basePath, nested, methods });
    }
  }

  const client = files.get("plane/client/plane_client.py");
  if (client === undefined) {
    throw new Error("plane/client/plane_client.py is not in the pin; the client wiring cannot be read");
  }
  const roots = new Map();
  const topPattern = /^ {8}self\.([a-z_0-9]+)[ \t]*=[ \t]*([A-Z][A-Za-z_0-9]*)\(self\.config\)/gm;
  for (const found of client.matchAll(topPattern)) roots.set(found[1], found[2]);
  if (roots.size === 0) {
    throw new Error("plane/client/plane_client.py assigns no resource; the client wiring cannot be read");
  }
  return { classes, roots, v2 };
}

/**
 * What a call site sends, walked from the client's own attribute assignments.
 *
 * A member's calls are a *list* because a method may reach more than one request. That
 * is reported rather than collapsed: which of them a tool ships is the endpoint table's
 * decision to record, and hiding the other one here would hide the decision.
 */
export function resolveCallSite(index, callSite) {
  const parts = String(callSite).split(".");
  if (parts[0] !== "client" || parts.length < 3) {
    throw new Error(`${callSite}: a client call site reads client.<resource>...<method>`);
  }
  let owner = null;
  for (const attribute of parts.slice(1, -1)) {
    const className = owner === null ? index.roots.get(attribute) : owner.nested.get(attribute);
    if (className === undefined) {
      throw new Error(`${callSite}: the pinned SDK never assigns "${attribute}" on this client`);
    }
    owner = index.classes.get(className);
    if (owner === undefined) {
      if (index.v2.has(className)) {
        throw new Error(`${callSite}: ${className} is in the v2 tree (${V2_ROOT}), which this index does not read`);
      }
      throw new Error(`${callSite}: the pinned SDK has no class ${className}`);
    }
  }
  const methodName = parts[parts.length - 1];
  const calls = owner.methods.get(methodName);
  if (calls === undefined) {
    throw new Error(`${callSite}: ${owner.file} declares no request for ${owner.name}.${methodName}`);
  }
  return { callSite, class: owner.name, file: owner.file, calls };
}

/**
 * The client members an alias stands for, read from the tool module that binds it.
 *
 * An action rarely calls a member directly: it binds a local name first, and the
 * binding is where the fork lives. These are the shapes the pinned tools use, one of
 * each kind, so the rules below can be read against them -
 *
 *     customers = client.customers                           customer.py
 *     values = properties.values                              workitem_property.py
 *     scoped_options = properties.options if project_id else workspace_properties.options
 *     scope = _scope_of(client, project_id)                   state.py
 *     types, scope, id_kwarg = _scope_of(client, project_id)  workitem_type.py
 *     namespace, target, models = scope                       template.py
 *     namespace=client.states                                 state.py, inside _scope_of
 *
 * - so an alias is resolved the way the module resolves it: a name is bound to an
 * expression, the expression is read for client members, a name bound to another name
 * or to a local factory is followed into the text that binds it, and a factory's
 * returned object is read for the attribute the alias asks of it (`scope.namespace` is
 * whatever `_scope_of` passed as `namespace=`, which is the pair of members the tool
 * forks between).
 *
 * Every member comes back, because a fork is a real pair of requests and which one
 * ships is the endpoint table's decision to record. A name that binds nothing
 * contributes nothing, which is what lets a conditional expression read as the two
 * members it chooses between rather than as a guess. Each member is then resolved, so
 * an alias naming a member the pin does not declare fails here rather than in a table
 * nobody re-reads.
 */
export function resolveAlias(index, alias, moduleSource) {
  const factories = functionBodies(moduleSource);
  const members = resolvePath(String(alias), [moduleSource], factories, 0);
  if (members.size === 0) throw new Error(`${alias}: the module never binds it to a client member`);
  for (const member of members) resolveCallSite(index, member);
  return [...members].sort();
}

/**
 * A recorded call site, resolved to the requests it stands for.
 *
 * The pin records both spellings of one thing: the member itself when an action calls
 * it inline (`client.cycles.list_archived`), and the local name an action bound it to
 * when it binds first (`types.list` -> `client.work_item_types.list`). The endpoint
 * table records whichever the pin recorded, so the branch belongs here rather than in
 * every caller that wants a request out of a recorded call.
 */
export function resolveRecorded(index, callSite, moduleSource) {
  const text = String(callSite);
  if (text.startsWith("client.")) {
    const resolved = resolveCallSite(index, text);
    return { members: [text], calls: resolved.calls, file: resolved.file };
  }
  const members = resolveAlias(index, text, moduleSource);
  const resolved = members.map((member) => resolveCallSite(index, member));
  return { members, calls: resolved.flatMap((item) => item.calls), file: resolved[0].file };
}

/** How far a chain of local bindings is followed before the reader gives up. */
const MAX_BINDING_DEPTH = 8;

/** A client member chain, `client.a.b`. */
const MEMBER = /client(?:\.[A-Za-z_][A-Za-z_0-9]*)+/g;

/** A dotted local name, `properties.values` - never the tail of a member chain. */
const DOTTED = /(?<![\w.])([A-Za-z_][A-Za-z_0-9]*)(?:\.[A-Za-z_][A-Za-z_0-9]*)+/g;

/** The body of every `def name(` in a source, keyed by name. */
function functionBodies(source) {
  const lines = source.split("\n");
  const bodies = new Map();
  for (let index = 0; index < lines.length; index += 1) {
    const header = /^([ \t]*)def[ \t]+([A-Za-z_][A-Za-z_0-9]*)[ \t]*\(/.exec(lines[index]);
    if (header === null) continue;
    const indent = header[1].length;
    let end = index + 1;
    while (end < lines.length) {
      const line = lines[end];
      if (line.trim() !== "" && /^[ \t]*/.exec(line)[0].length <= indent) break;
      end += 1;
    }
    bodies.set(header[2], lines.slice(index + 1, end).join("\n"));
  }
  return bodies;
}

/** Every expression a source binds `name` to: a target of `=` or of a tuple target. */
function boundExpressions(name, source) {
  const expressions = [];
  for (const match of source.matchAll(/^[ \t]*([A-Za-z_0-9, \t()]+?)[ \t]*=(?!=)[ \t]*(.+)$/gm)) {
    if (!match[1].split(",").map((target) => target.trim()).includes(name)) continue;
    expressions.push(match[2]);
  }
  return expressions;
}

/** The members `path` stands for, read from the sources that may bind its first segment. */
function resolvePath(path, sources, factories, depth) {
  const members = new Set();
  if (depth > MAX_BINDING_DEPTH) return members;
  const [head, ...rest] = path.split(".");
  for (const source of sources) {
    for (const expression of boundExpressions(head, source)) {
      for (const member of expressionMembers(expression, rest, sources, factories, depth)) members.add(member);
    }
  }
  return members;
}

/** The members an expression stands for, with `rest` appended to every one of them. */
function expressionMembers(expression, rest, sources, factories, depth) {
  const members = new Set();
  for (const chain of expression.match(MEMBER) ?? []) members.add([chain, ...rest].join("."));
  const trimmed = expression.trim();
  const call = /^([A-Za-z_][A-Za-z_0-9]*)[ \t]*\(/.exec(trimmed);
  if (call !== null && factories.has(call[1])) {
    // A local factory: the name stands for whatever it hands back. The segment the
    // alias asks of that return is the attribute the factory called by that name -
    // `scope.namespace` is the `namespace=` the factory passed - and a factory that
    // binds no such name is read whole, which is how a returned tuple is read for the
    // members it carries.
    const body = factories.get(call[1]);
    const [segment, ...tail] = rest;
    const inner = segment === undefined ? [] : boundExpressions(segment, body);
    for (const bound of inner.length > 0 ? inner : [body]) {
      const forwarded = inner.length > 0 ? tail : rest;
      for (const member of expressionMembers(bound, forwarded, [body, ...sources], factories, depth + 1)) {
        members.add(member);
      }
    }
  }
  if (/^[A-Za-z_][A-Za-z_0-9]*(?:\.[A-Za-z_][A-Za-z_0-9]*)*$/.test(trimmed) && trimmed !== "client") {
    for (const member of resolvePath([trimmed, ...rest].join("."), sources, factories, depth + 1)) members.add(member);
  }
  for (const name of dottedNames(trimmed)) {
    for (const member of resolvePath([name, ...rest].join("."), sources, factories, depth + 1)) members.add(member);
  }
  return members;
}

/** The dotted local names an expression mentions, as paths a binding can be followed from. */
function dottedNames(expression) {
  const names = new Set();
  for (const match of expression.matchAll(DOTTED)) {
    if (match[1] !== "client") names.add(match[0]);
  }
  return names;
}

function main() {
  const callSites = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
  const { files } = readPinnedSdk();
  const index = buildSdkIndex(files);
  if (callSites.length === 0) {
    const methods = [...index.classes.values()].reduce((total, item) => total + item.methods.size, 0);
    console.log(`${index.classes.size} class(es) and ${methods} method(s) read from the pinned SDK`);
    console.log("usage: node scripts/plane/sdk-index.mjs <client.resource.method> [...]");
    return;
  }
  let failed = false;
  for (const callSite of callSites) {
    try {
      const resolved = resolveCallSite(index, callSite);
      for (const call of resolved.calls) {
        console.log(`${call.method.padEnd(6)} ${call.path}   [${callSite} -> ${resolved.file}]`);
      }
    } catch (error) {
      failed = true;
      console.error(`${callSite}: ${error.message}`);
    }
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
