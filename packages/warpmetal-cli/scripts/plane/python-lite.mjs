/**
 * A reader for the frozen subset of Python that Plane's MCP tool modules use.
 *
 * Plane publishes no OpenAPI document, so the inventory of what the vendor's MCP
 * server actually does has to come from its source: one module per resource,
 * each with an `ACTIONS` tuple that is - by that package's own design - the
 * single source of truth for the description, the MCP annotations and the
 * argument validation (`plane_mcp/toolkit/spec.py` says so, and its
 * `test_conformance.py` asserts it). Reading `ACTIONS` is therefore reading the
 * vendor's own contract, not a guess about it.
 *
 * The tuple is Python, not JSON, so this file evaluates the small subset that
 * appears in those declarations and *fails loudly* on anything else:
 *
 *     Action("list", ("project_id",), ("pql", *QUERY_FIELDS), read=True)
 *     Action("create", ("project_id", "name"), WRITE_FIELDS[1:])
 *     Action(name="count", optional=("project_id",), note="..." "..." )
 *
 * Supported: string literals (including implicit concatenation and triple
 * quotes), tuples and lists (including `*` splats), dicts, names bound by a
 * module-level assignment, integer slices, `True`/`False`/`None`, and the
 * `Action(...)` call itself. Not supported on purpose: comprehensions, calls to
 * other functions, f-string interpolation, `if`/`else` expressions. A construct
 * outside the subset raises `PythonLiteError` naming the file and line rather
 * than silently dropping an action, which is the only failure mode that would
 * be dangerous here - a missing action looks exactly like an action that was
 * deliberately excluded.
 *
 * This is deliberately not a Python interpreter. It is the smallest reader that
 * can be reviewed, unit-tested and run in CI without a Python toolchain.
 */

/** The value of an expression this reader cannot evaluate. */
export const UNKNOWN = { unknown: true };

export class PythonLiteError extends Error {}

const PREFIX_CHARS = "rRbBuUfF";

/** Consumes a string literal at `i`, or returns null when there is none. */
function matchString(source, i) {
  let j = i;
  let fstring = false;
  while (j < source.length && j - i < 3 && PREFIX_CHARS.includes(source[j])) {
    if ("fF".includes(source[j])) fstring = true;
    j += 1;
  }
  const quote = source[j];
  if (quote !== '"' && quote !== "'") return null;
  const raw = source.slice(i, j).toLowerCase().includes("r");
  const triple = source.slice(j, j + 3) === quote.repeat(3);
  const open = triple ? 3 : 1;
  let k = j + open;
  let value = "";
  while (k < source.length) {
    const ch = source[k];
    if (!raw && ch === "\\") {
      const next = source[k + 1];
      const escapes = { n: "\n", t: "\t", r: "\r", "\\": "\\", '"': '"', "'": "'" };
      const literal = escapes[next];
      if (literal !== undefined) {
        value += literal;
        k += 2;
        continue;
      }
      value += ch + (next ?? "");
      k += 2;
      continue;
    }
    if (ch === quote) {
      if (!triple) return { value, length: k + 1 - i, triple, fstring };
      if (source.slice(k, k + 3) === quote.repeat(3)) {
        return { value, length: k + 3 - i, triple, fstring };
      }
    }
    value += ch;
    k += 1;
  }
  throw new PythonLiteError(`unterminated string literal at offset ${i}`);
}

/**
 * Splits Python source into tokens, tracking the column each token starts at.
 *
 * The column is load-bearing: a module-level assignment is the one that starts
 * at column 0, which is how this reader tells `ACTIONS = (...)` apart from the
 * `action = ...` local inside `register()` without understanding blocks.
 */
export function tokenize(source) {
  const tokens = [];
  let line = 1;
  let col = 0;
  let i = 0;
  const advance = (count) => {
    for (let k = 0; k < count; k += 1) {
      if (source[i] === "\n") {
        line += 1;
        col = 0;
      } else {
        col += 1;
      }
      i += 1;
    }
  };
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\n") {
      tokens.push({ type: "NEWLINE", value: "\n", line, col });
      advance(1);
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\r") {
      advance(1);
      continue;
    }
    if (ch === "#") {
      while (i < source.length && source[i] !== "\n") advance(1);
      continue;
    }
    if (ch === "\\" && source[i + 1] === "\n") {
      advance(2);
      continue;
    }
    const literal = matchString(source, i);
    if (literal !== null) {
      tokens.push({
        type: "STRING",
        value: literal.value,
        line,
        col,
        triple: literal.triple,
        fstring: literal.fstring,
      });
      advance(literal.length);
      continue;
    }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i));
    if (name !== null) {
      tokens.push({ type: "NAME", value: name[0], line, col });
      advance(name[0].length);
      continue;
    }
    const number = /^[0-9][0-9_]*/.exec(source.slice(i));
    if (number !== null) {
      tokens.push({ type: "NUMBER", value: Number(number[0].replaceAll("_", "")), line, col });
      advance(number[0].length);
      continue;
    }
    tokens.push({ type: "OP", value: ch, line, col });
    advance(1);
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

/** Skips statement separators, which are noise between the terms of a tuple. */
function skipFill(tokens, i) {
  let j = i;
  while (tokens[j]?.type === "NEWLINE") j += 1;
  return j;
}

function isOp(token, value) {
  return token !== undefined && token.type === "OP" && token.value === value;
}

/** Index of the `=` of an assignment starting at `i`, or -1. */
function findAssignEquals(tokens, i) {
  let j = i + 1;
  if (isOp(tokens[j], "=")) return j;
  if (!isOp(tokens[j], ":")) return -1;
  let depth = 0;
  for (; j < tokens.length; j += 1) {
    const token = tokens[j];
    if (token.type === "NEWLINE" && depth === 0) return -1;
    if (token.type === "OP") {
      if ("([{".includes(token.value)) depth += 1;
      else if (")]}".includes(token.value)) depth -= 1;
      else if (token.value === "=" && depth === 0) return j;
    }
  }
  return -1;
}

/** Parses `expr , expr , ...` up to `closer`, keeping splats and dict keys. */
function parseSeq(tokens, i, env, closer) {
  const items = [];
  let seenComma = false;
  let j = i;
  for (;;) {
    j = skipFill(tokens, j);
    if (isOp(tokens[j], closer)) return { items, next: j + 1, seenComma };
    if (tokens[j] === undefined) throw new PythonLiteError(`unterminated sequence, expected "${closer}"`);
    let splat = false;
    let key = null;
    if (isOp(tokens[j], "*")) {
      splat = true;
      j += 1;
    }
    j = skipFill(tokens, j);
    if (!splat && tokens[j]?.type === "STRING" && isOp(tokens[j + 1], ":")) {
      key = tokens[j].value;
      j += 2;
    } else if (!splat && tokens[j]?.type === "NAME" && isOp(tokens[j + 1], "=") && !isOp(tokens[j + 2], "=")) {
      // A keyword argument (`read=True`), as opposed to a dict entry. The guard
      // keeps a comparison (`action == "x"`) from being read as one.
      key = tokens[j].value;
      j += 2;
    }
    const parsed = parseExpr(tokens, j, env);
    items.push({ splat, key, value: parsed.value, line: tokens[j]?.line });
    j = skipFill(tokens, parsed.next);
    if (isOp(tokens[j], ",")) {
      seenComma = true;
      j += 1;
      continue;
    }
    if (isOp(tokens[j], closer)) return { items, next: j + 1, seenComma };
    throw new PythonLiteError(`expected "," or "${closer}" at line ${tokens[j]?.line ?? "?"}`);
  }
}

/** `[1]` or `[1:]` or `[:2]`, over a value the caller already resolved. */
function applySubscript(value, text, line) {
  if (!Array.isArray(value)) {
    throw new PythonLiteError(`cannot subscript a non-sequence at line ${line}`);
  }
  if (!text.includes(":")) return value[Number(text)];
  const [from, to] = text.split(":");
  return value.slice(from === "" ? 0 : Number(from), to === "" ? undefined : Number(to));
}

/** Tokens between `[` at `i` and its `]`, as one string, plus the index after. */
function readSubscript(tokens, i) {
  let j = i + 1;
  let text = "";
  while (!isOp(tokens[j], "]")) {
    const token = tokens[j];
    if (token === undefined) throw new PythonLiteError("unterminated subscript");
    text += token.type === "NEWLINE" ? "" : String(token.value);
    j += 1;
  }
  return { text, next: j + 1 };
}

/** Index after the bracket that closes the one at `i`, ignoring what is inside. */
function skipBalanced(tokens, i, opener, closer) {
  let depth = 0;
  for (let j = i; j < tokens.length; j += 1) {
    if (isOp(tokens[j], opener)) depth += 1;
    else if (isOp(tokens[j], closer)) {
      depth -= 1;
      if (depth === 0) return j + 1;
    }
  }
  throw new PythonLiteError(`unbalanced "${opener}" at line ${tokens[i]?.line ?? "?"}`);
}

function callNode(name, items, line) {
  const args = [];
  const kwargs = {};
  for (const item of items) {
    if (item.splat) {
      args.push({ splat: true, value: item.value });
      continue;
    }
    if (item.key !== null) kwargs[item.key] = item.value;
    else args.push({ splat: false, value: item.value });
  }
  return { __call: name, args, kwargs, line };
}

function parsePrimary(tokens, i, env) {
  const j = skipFill(tokens, i);
  const token = tokens[j];
  if (token === undefined) throw new PythonLiteError("unexpected end of module");
  if (token.type === "NUMBER") return { value: token.value, next: j + 1 };
  if (token.type === "STRING") {
    let value = "";
    let interpolated = false;
    let k = j;
    for (;;) {
      const current = tokens[k];
      if (current.type === "STRING") {
        // An f-string is consumed rather than refused: descriptions interpolate
        // vocabulary that lives in a `get_args(Enum)`, which is outside this
        // subset, and a description we cannot read is a description we do not
        // need. The value becomes UNKNOWN, so anything that *does* need it - the
        // contract, the alias tables - still fails loudly.
        if (current.fstring) interpolated = true;
        else value += current.value;
        k += 1;
        continue;
      }
      // Implicit concatenation may cross a newline, but only inside brackets,
      // where the continuation line is indented. A line that starts at column 0
      // is the next statement, and folding it in would swallow a whole
      // declaration into a description.
      let p = k;
      while (tokens[p]?.type === "NEWLINE") p += 1;
      if (p !== k && (tokens[p] === undefined || tokens[p].col === 0)) break;
      if (tokens[p]?.type !== "STRING") break;
      k = p;
    }
    return { value: interpolated ? UNKNOWN : value, next: k };
  }
  if (isOp(token, "(")) {
    const { items, next, seenComma } = parseSeq(tokens, j + 1, env, ")");
    if (items.length === 1 && !seenComma && !items[0].splat && items[0].key === null) {
      return { value: items[0].value, next };
    }
    return { value: flatten(items, "tuple"), next };
  }
  if (isOp(token, "[")) {
    const { items, next } = parseSeq(tokens, j + 1, env, "]");
    return { value: flatten(items, "list"), next };
  }
  if (isOp(token, "{")) {
    const { items, next } = parseSeq(tokens, j + 1, env, "}");
    const out = {};
    for (const item of items) {
      if (item.key === null) throw new PythonLiteError(`dict entry without a key at line ${item.line}`);
      out[item.key] = item.value;
    }
    return { value: out, next };
  }
  if (token.type === "NAME") {
    if (isOp(tokens[j + 1], "(")) {
      const next = skipBalanced(tokens, j + 1, "(", ")");
      const inner = tokens.slice(j + 2, next - 1);
      if (inner.some((entry) => entry.type === "NAME" && (entry.value === "for" || entry.value === "if"))) {
        // A comprehension or generator expression - `tuple(e.value for e in ...)`.
        // Evaluated as UNKNOWN like any other vocabulary builder; anything that
        // actually needs it fails when it is validated.
        return { value: UNKNOWN, next };
      }
      const { items } = parseSeq(tokens, j + 2, env, ")");
      return { value: callNode(token.value, items, token.line), next };
    }
    if (isOp(tokens[j + 1], "[")) {
      const base = env.has(token.value) ? env.get(token.value) : UNKNOWN;
      const sub = readSubscript(tokens, j + 1);
      return { value: applySubscript(base, sub.text, token.line), next: sub.next };
    }
    if (isOp(tokens[j + 1], ".")) {
      // Attribute access, and every call or subscript hanging off it: outside the
      // subset, but consumed rather than refused, because the declarations that
      // use it only build vocabularies (`model_fields["x"].annotation`) that
      // `ACTIONS` does not reference.
      let cursor = j + 1;
      for (;;) {
        if (isOp(tokens[cursor], ".") && tokens[cursor + 1]?.type === "NAME") cursor += 2;
        else if (isOp(tokens[cursor], "(")) cursor = skipBalanced(tokens, cursor, "(", ")");
        else if (isOp(tokens[cursor], "[")) cursor = skipBalanced(tokens, cursor, "[", "]");
        else break;
      }
      return { value: UNKNOWN, next: cursor };
    }
    if (token.value === "True") return { value: true, next: j + 1 };
    if (token.value === "False") return { value: false, next: j + 1 };
    if (token.value === "None") return { value: null, next: j + 1 };
    return { value: env.has(token.value) ? env.get(token.value) : UNKNOWN, next: j + 1 };
  }
  throw new PythonLiteError(`unsupported token "${token.value}" at line ${token.line}`);
}

/**
 * A primary, plus any `+` concatenation hanging off it.
 *
 * `FOOTER` values are assembled that way (`f"..." "..." + PQL_FIELD_HINT`), and
 * one of the halves is usually an f-string, so the result is a string only when
 * both halves are.
 */
function parseExpr(tokens, i, env) {
  let { value, next } = parsePrimary(tokens, i, env);
  while (isOp(tokens[next], "+")) {
    const right = parsePrimary(tokens, next + 1, env);
    value = typeof value === "string" && typeof right.value === "string" ? value + right.value : UNKNOWN;
    next = right.next;
  }
  return { value, next };
}

function flatten(items, what) {
  const out = [];
  for (const item of items) {
    if (item.splat) {
      if (!Array.isArray(item.value)) {
        throw new PythonLiteError(`cannot splat a non-${what} at line ${item.line}`);
      }
      out.push(...item.value);
      continue;
    }
    out.push(item.value);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The module-level declarations
// ---------------------------------------------------------------------------

/** `Action`'s fields, in the order `plane_mcp/toolkit/spec.py` declares them. */
const ACTION_FIELDS = ["name", "requires", "optional", "note", "read", "destructive", "openWorld"];

function snakeToCamel(name) {
  return name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/** One `Action(...)` call, validated field by field. */
function toAction(node, file) {
  if (typeof node !== "object" || node === null || node.__call !== "Action") {
    throw new PythonLiteError(`${file}: ACTIONS holds something that is not an Action(...) call`);
  }
  const action = {
    name: null,
    requires: [],
    optional: [],
    note: "",
    read: false,
    destructive: false,
    openWorld: false,
    line: node.line,
  };
  node.args.forEach((argument, position) => {
    if (argument.splat) throw new PythonLiteError(`${file}: Action(...) takes no splat argument`);
    const field = ACTION_FIELDS[position];
    if (field === undefined) throw new PythonLiteError(`${file}: Action(...) takes at most 7 arguments`);
    action[field] = argument.value;
  });
  for (const [key, value] of Object.entries(node.kwargs)) {
    const field = snakeToCamel(key);
    if (!ACTION_FIELDS.includes(field)) {
      throw new PythonLiteError(`${file}: Action(...) got an unknown keyword "${key}"`);
    }
    action[field] = value;
  }
  if (typeof action.name !== "string") throw new PythonLiteError(`${file}: an Action has no name`);
  if (typeof action.note !== "string") {
    throw new PythonLiteError(`${file}: Action ${action.name} has a non-string note`);
  }
  for (const field of ["requires", "optional"]) {
    const value = action[field];
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
      throw new PythonLiteError(`${file}: Action ${action.name}.${field} is not a tuple of strings`);
    }
  }
  for (const field of ["read", "destructive", "openWorld"]) {
    action[field] = action[field] === true;
  }
  return action;
}

function toStringMap(value, file, what) {
  if (value === undefined) return {};
  if (value === UNKNOWN) throw new PythonLiteError(`${file}: ${what} could not be evaluated`);
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") throw new PythonLiteError(`${file}: ${what}["${key}"] is not a string`);
    out[key] = entry;
  }
  return out;
}

/**
 * Every module-level assignment, plus the declarations this pipeline needs.
 *
 * `ACTIONS` is the contract. `LEGACY` and `LEGACY_UNMAPPED` are recorded because
 * they are the vendor's own account of the names it retired - worth having when
 * deciding whether our tools should follow the vendor's current names or the
 * retired ones callers may still be using.
 */
export function readModule(source, file = "<module>") {
  const tokens = tokenize(source);
  const env = new Map();
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.type === "NAME" && token.col === 0) {
      const equals = findAssignEquals(tokens, i);
      if (equals !== -1) {
        const parsed = parseExpr(tokens, equals + 1, env);
        env.set(token.value, parsed.value);
        i = parsed.next;
        continue;
      }
    }
    i += 1;
  }
  const declared = env.get("ACTIONS");
  if (declared === UNKNOWN) throw new PythonLiteError(`${file}: ACTIONS could not be evaluated`);
  const actions = Array.isArray(declared) ? declared.map((node) => toAction(node, file)) : [];
  return {
    name: typeof env.get("NAME") === "string" ? env.get("NAME") : null,
    title: typeof env.get("TITLE") === "string" ? env.get("TITLE") : null,
    actions,
    legacy: toStringMap(env.get("LEGACY"), file, "LEGACY"),
    legacyUnmapped: toStringMap(env.get("LEGACY_UNMAPPED"), file, "LEGACY_UNMAPPED"),
  };
}

/**
 * Where each action's requests come from, read off the shape of its dispatch.
 *
 * A heuristic, and labelled as one wherever it lands in a generated file. Our own
 * surface builds exactly one HTTP request per tool, so an action whose branch
 * reaches the SDK more than once - or inside a loop, or through a helper that
 * paginates - cannot become one tool without being split into the single-request
 * actions it is made of, or dropped. Counting SDK calls per branch answers that
 * without reading thirty modules by hand; the review step still confirms every
 * action this calls multi against the branch itself.
 *
 * The dispatch functions are uniform enough to read:
 *
 *   - a *marker* is an `if/elif action == "x"` or `if/elif action in (...)` line.
 *     A condition that continues on the next line (the `manage_assignee`
 *     conditional expression) is not a statement, and so not a marker;
 *   - an action's *branch* is the region of the marker naming it, minus the
 *     regions of markers nested inside it: those run only on their own condition,
 *     so a `list` branch containing a nested `list_archived` branch is one request
 *     on either path;
 *   - an action the chain never names is attributed to the *fall-through* region -
 *     the lines of the dispatch function no marker covers - which is where such
 *     actions' calls live (`cycle.unarchive`);
 *   - a *request line* is a line that reaches the SDK: a call on `client`, or on a
 *     name standing for part of it however the module arrived at one - bound
 *     directly (`customers = client.customers`), handed back by a helper (`scope =
 *     _scope_of(client, ...)`, then `scope.namespace.list(...)`), unpacked from one,
 *     or parked in a local (`operation = client.work_items.archive if ... else ...`,
 *     then `operation(...)`). A bound method handed to a toolkit helper counts as
 *     one request (the reference is all the branch shows); one line choosing between
 *     two methods is one request, and two lines in sequence are two;
 *
 * Returns `null` for a module with no action dispatch and no SDK call at all: a
 * tool whose actions issue no request.
 */
export function readDispatcherShapes(source) {
  const lines = source.split("\n");
  const indentOf = (text) => text.length - text.trimStart().length;

  // Module-level helpers, so that a branch calling one is credited with the
  // requests that helper makes.
  const helpers = new Map();
  lines.forEach((text, index) => {
    const head = /^def ([A-Za-z_0-9]+)\(/.exec(text);
    if (head === null) return;
    // A signature can wrap, and its closing bracket can land in column zero - where
    // it reads as the start of the next top-level statement. Counting brackets
    // finds the end of the header, and the body runs from there.
    let depth = 0;
    let body = index + 1;
    for (let next = index; next < lines.length; next += 1) {
      const code = lines[next].replace(/#.*$/, "");
      for (const char of code) {
        if (char === "(" || char === "[") depth += 1;
        else if (char === ")" || char === "]") depth -= 1;
      }
      if (depth <= 0 && code.trimEnd().endsWith(":")) {
        body = next + 1;
        break;
      }
    }
    let stop = lines.length;
    for (let next = body; next < lines.length; next += 1) {
      if (lines[next].trim() !== "" && indentOf(lines[next]) === 0) {
        stop = next;
        break;
      }
    }
    helpers.set(head[1], [body, stop]);
  });

  const range = (from, to) => {
    const out = [];
    for (let index = from; index < to; index += 1) out.push(index);
    return out;
  };

  // Where the SDK is reached from: `client` itself, and every name standing for
  // part of it, however the module arrives at one - bound directly (`customers =
  // client.customers`), handed back by a helper (`scope = _scope_of(client, ...)`,
  // then `scope.namespace.list(...)`), taken apart (`namespace, target, models =
  // scope`, or `types, scope, id_kwarg = _scope_of(client, ...)`), or parked in a
  // local (`operation = client.work_items.archive if ... else ...`, then
  // `operation(...)`).
  const clientish = new Set(["client"]);
  const handsBack = new Set();
  for (;;) {
    const before = clientish.size + handsBack.size;
    const names = [...clientish].join("|");
    const mentions = new RegExp(`(?:^|[^A-Za-z_0-9.])(?:${names})\\.`);
    const returns = [...handsBack].map((name) => new RegExp(`(?:^|[^A-Za-z_0-9.])${name}\\s*\\(`));
    // A bare name standing for part of the client is one as well, and taking it
    // apart hands the parts on: `namespace, target, models = scope`.
    const stands = new RegExp(`^(?:${names})$`);

    lines.forEach((text) => {
      // The left side is a target list, which may nest a tuple or take a name apart
      // (`namespace, target, (create_model, update_model) = scope`). A trailing
      // keyword argument cannot be read as one: `.`, `"` and `:` are not in the
      // class, so a call line never matches.
      const assignment = /^\s*([A-Za-z_][A-Za-z_0-9_(),* \t]*?)\s*=(?!=)\s*(.+?)\s*$/.exec(text);
      if (assignment === null) return;
      const value = assignment[2];
      if (!mentions.test(value) && !stands.test(value) && !returns.some((pattern) => pattern.test(value)))
        return;
      for (const name of assignment[1].matchAll(/[A-Za-z_][A-Za-z_0-9]*/g)) clientish.add(name[0]);
    });
    for (const [name, [from, to]] of helpers) {
      if (handsBack.has(name)) continue;
      if (range(from, to).some((line) => mentions.test(lines[line]))) handsBack.add(name);
    }
    if (clientish.size + handsBack.size === before) break;
  }

  const names = [...clientish].join("|");
  // Each pattern captures the client member it calls, because that name is the
  // vendor's own word for the operation (`work_items.list`, `work_items.create`)
  // and it is what ties one of their actions to one endpoint.
  const call = new RegExp(`(?:^|[^A-Za-z_0-9.])((?:${names})(?:\\.[A-Za-z_0-9]+)*)\\s*\\(`);
  // A bound method handed to a toolkit helper is a request too, and the reference
  // is the only trace of it: `client.cycles.list_work_items,` passed to
  // `workitem_page`, which calls it once.
  const handed = new RegExp(`^\\s*((?:${names})(?:\\.[A-Za-z_0-9]+)+),\\s*$`);

  const sdk = new Set();
  /** The client member each request line calls, by line index. */
  const callees = new Map();
  const loopBlocks = new Map();
  lines.forEach((text, index) => {
    if (!/^\s*#/.test(text)) {
      const matched = call.exec(text) ?? handed.exec(text);
      if (matched !== null) {
        sdk.add(index);
        callees.set(index, matched[1]);
      }
    }
    if (/^\s+(?:for|while)\s/.test(text) && /:\s*$/.test(text)) {
      let stop = lines.length;
      for (let next = index + 1; next < lines.length; next += 1) {
        if (lines[next].trim() !== "" && indentOf(lines[next]) <= indentOf(text)) {
          stop = next;
          break;
        }
      }
      loopBlocks.set(index, range(index + 1, stop));
    }
  });

  const markers = [];
  lines.forEach((text, index) => {
    const head = /^([ \t]*)(?:if|elif)\s+action\s*(?:==\s*"([a-z_0-9]+)"|in\s*\(([^)]*)\))/.exec(text);
    if (head === null) return;
    if (!/:\s*$/.test(text.replace(/"[^"]*"/g, '""'))) return;
    const names =
      head[2] !== undefined ? [head[2]] : [...head[3].matchAll(/"([a-z_0-9]+)"/g)].map((match) => match[1]);
    markers.push({ line: index, indent: head[1].length, names });
  });
  if (markers.length === 0) {
    if (sdk.size === 0) return null;
    throw new PythonLiteError(`${sdk.size} SDK calls but no "if action ==" dispatch to read`);
  }

  const start = markers[0].line;
  // The dispatch runs to the end of the function holding it. That is not always
  // the line where indentation comes back to the chain's own level: a chain can
  // start inside an earlier branch (`workitem_property` routes `*_value` actions
  // first and takes `get_value` apart inside that branch), and stopping there
  // would empty every branch after it.
  const chainIndent = indentOf(lines[start]);
  let holder = -1;
  for (let index = 0; index < start; index += 1) {
    const head = /^([ \t]*)def\s/.exec(lines[index]);
    if (head !== null && head[1].length < chainIndent) holder = head[1].length;
  }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index].trim() !== "" && indentOf(lines[index]) <= holder) {
      end = index;
      break;
    }
  }
  // Each branch ends where the indentation comes back to its own level or less.
  const bounds = markers.map((marker) => {
    let stop = end;
    for (let index = marker.line + 1; index < end; index += 1) {
      if (lines[index].trim() !== "" && indentOf(lines[index]) <= marker.indent) {
        stop = index;
        break;
      }
    }
    return stop;
  });
  const collect = (indices, seen = new Set()) => {
    const found = new Set();
    const called = new Set();
    const visited = new Set();
    for (const index of indices) {
      visited.add(index);
      if (sdk.has(index)) found.add(index);
      for (const word of lines[index].match(/[A-Za-z_][A-Za-z_0-9]*/g) ?? []) {
        if (!helpers.has(word) || word === "register" || seen.has(word)) continue;
        seen.add(word);
        called.add(word);
        const [from, to] = helpers.get(word);
        const inner = collect(range(from, to), seen);
        for (const line of inner.found) found.add(line);
        for (const line of inner.visited) visited.add(line);
      }
    }
    return { found, visited, called };
  };

  // A branch's own lines: its region minus the regions of the markers nested in it.
  const branchLines = markers.map((marker, index) => {
    const own = new Set(range(marker.line + 1, bounds[index]));
    markers.forEach((child, other) => {
      if (child.line > marker.line && child.line < bounds[index] && child.indent > marker.indent) {
        for (const line of range(child.line, bounds[other])) own.delete(line);
      }
    });
    return [...own];
  });
  // The lines an action runs through: the branch of each marker naming it, plus
  // the branches of the markers nested in those that name it too.
  const linesFor = (index, name, seen = new Set()) => {
    if (seen.has(index)) return [];
    seen.add(index);
    const onPath = [...branchLines[index]];
    markers.forEach((child, other) => {
      if (child.line > markers[index].line && child.line < bounds[index] && child.names.includes(name)) {
        onPath.push(...linesFor(other, name, seen));
      }
    });
    return onPath;
  };

  const covered = new Set();
  markers.forEach((marker, index) => {
    for (const line of range(marker.line, bounds[index])) covered.add(line);
  });
  const fallThrough = range(start, end).filter((line) => !covered.has(line));

  const rank = { none: 0, single: 1, multi: 2 };
  const shapes = {};
  const describe = (indices, branch) => {
    const { found, visited, called } = collect(indices);
    // Only a loop whose body issues a request makes it more than one request: a
    // `for` that formats a response is still one call.
    const looped = [...visited].some((line) => (loopBlocks.get(line) ?? []).some((inner) => found.has(inner)));
    const requestShape = found.size === 0 ? "none" : found.size === 1 && !looped ? "single" : "multi";
    // What the vendor calls, in their own words. The allowlist maps one action to
    // one endpoint, so this is the evidence that the endpoint it names is the one
    // the action actually reaches - and that an action reaching two different
    // operations was not quietly mapped to one of them.
    const sdkCalls = [...new Set([...found].map((line) => callees.get(line)).filter(Boolean))].sort();
    const shape = { requestLines: found.size, loops: looped, branch, requestShape };
    if (sdkCalls.length > 0) shape.sdkCalls = sdkCalls;
    if (called.size > 0) shape.requestHelpers = [...called].sort();
    return shape;
  };
  const record = (name, shape) => {
    if (shapes[name] === undefined || rank[shape.requestShape] > rank[shapes[name].requestShape]) {
      shapes[name] = shape;
    }
  };
  markers.forEach((marker, index) => {
    for (const name of marker.names) record(name, describe(linesFor(index, name), "own"));
  });
  // The fall-through region answers for every action the chain does not name, and
  // this function does not know their names, so `*` stands in for them: it cannot
  // collide with an action name.
  shapes["*"] = describe(fallThrough, "fall-through");
  return shapes;
}
