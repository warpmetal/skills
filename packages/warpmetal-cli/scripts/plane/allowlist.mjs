/**
 * The reviewed Plane tool decisions, and the rules that keep them honest.
 *
 * `allowlist.json` is the artifact a human reviews; the generators only obey it.
 * Plane publishes no spec to compare against, so the review has two halves that
 * have to agree: the *selection* (which of the vendor's 207 actions ship, and
 * why) in this file, and the *endpoint* (what request each one becomes) in
 * `endpoints.mjs`. Neither half is derived from the other, and the validator below
 * refuses to build either when they disagree - a name that does not match its
 * resource, an action the pinned release does not declare, a missing reason, a
 * `destructive` claim the vendor contradicts, a tool with no endpoint, an endpoint
 * with no tool, or an endpoint whose `sdk` is not the call site the pin recorded
 * for that action.
 *
 * The rules that are Plane-specific, and why:
 *
 *   - **One action, one request, one endpoint.** The vendor's own tools are the
 *     contract; a tool of ours that merged two of their actions, or that mapped
 *     one action to two requests, would be a different promise. An action the pin
 *     classifies as more than one request cannot be allowlisted at all.
 *   - **`flowNote` where the pin sees anything but a plain single request.** A
 *     branch the dispatcher does not own for itself, a second request line, a
 *     loop, or an endpoint whose argument chooses the branch (a project-scoped
 *     collection against a workspace-scoped one) each need a sentence saying what
 *     ships and what does not - otherwise the difference is found by a caller.
 *   - **`destructive` has to be argued.** The vendor marks 35 of its actions
 *     destructive, so both directions are checked: a destructive action we ship as
 *     an ordinary write needs a `destructiveReason`, and a `destructive` claim has
 *     to name the vendor's flag or the delete it performs.
 */
import { readFileSync } from "node:fs";

const SLUG = /^plane_[a-z0-9]+(_[a-z0-9]+)*$/;
const ACTION_ID = /^[a-z_0-9]+\.[a-z_0-9]+$/;

/** A sentence: at least this many characters, so "n/a" is not a reason. */
function prose(value) {
  return typeof value === "string" && value.trim().length >= 12;
}

/**
 * How one reviewed entry spends its arguments: which reach the path, the query
 * and the body, and which argument - if any - chooses between endpoints.
 *
 * Exported because two generators need the same answer: the route builder writes
 * the request from it, and the catalog writes the argument descriptions from it.
 * Two answers to one question is how a field ends up described as a query
 * parameter and sent in the body.
 */
export function argumentRoles(entry) {
  const { action, endpoint } = entry;
  const declared = [...(action.requires ?? []), ...(action.optional ?? [])];
  const paths = typeof endpoint.path === "string" ? [endpoint.path] : Object.values(endpoint.path.cases);
  const placeholders = new Set(
    paths.flatMap((path) => [...path.matchAll(/\{([a-z_0-9]+)\}/g)].map((match) => match[1])),
  );
  const queries =
    endpoint.query === "args"
      ? declared.filter((name) => !placeholders.has(name))
      : Array.isArray(endpoint.query)
        ? endpoint.query
        : [];
  const body = endpoint.body;
  const bodyArgs =
    body === undefined || body === null
      ? []
      : body === "args"
        ? declared.filter((name) => !placeholders.has(name) && !queries.includes(name))
        : body.arg !== undefined
          ? [body.arg]
          : Object.values(body);
  const chosenBy = typeof endpoint.path === "object" ? endpoint.path.arg : undefined;
  return { declared, paths, placeholders, queries, bodyArgs, chosenBy };
}

/**
 * Reads and validates the allowlist against the pinned inventory and the endpoint
 * table. Returns `problems` (fatal: no generator may run) and `warnings` (printed
 * in the docs). Both are strings a reader can act on.
 */
export function loadAllowlist(path, inventory, endpoints, file) {
  const document = file ?? JSON.parse(readFileSync(path, "utf8"));
  const problems = [];
  const warnings = [];
  const entries = [];
  const seen = new Set();

  if (document.version !== 1) {
    problems.push(`allowlist: version must be 1, found ${String(document.version)}`);
  }
  // The pin is the only tie between a reviewed decision and the surface it was
  // made against: a re-pinned release can add an action, drop one, or change what
  // an action reaches, and every one of those has to be re-reviewed.
  const pinnedTag = document.inventory?.tag;
  if (pinnedTag !== inventory.source.tag) {
    problems.push(
      `allowlist: inventory.tag is ${String(pinnedTag)}, but the pin is ${inventory.source.tag}; ` +
        "re-review the allowlist against the new release",
    );
  }

  const waves = document.waves ?? {};
  const waveNames = new Set(Object.keys(waves));

  /** The vendor's actions, by `<resource>.<action>`. */
  const actions = new Map();
  for (const tool of inventory.tools) {
    for (const action of tool.actions) {
      actions.set(`${tool.tool}.${action.name}`, { ...action, resource: tool.tool, title: tool.title });
    }
  }

  const tools = Array.isArray(document.tools) ? document.tools : [];
  if (tools.length === 0) problems.push("allowlist: tools must be a non-empty list");

  for (const entry of tools) {
    const where = typeof entry.toolSlug === "string" ? entry.toolSlug : JSON.stringify(entry.toolSlug);
    if (typeof entry.toolSlug !== "string" || !SLUG.test(entry.toolSlug)) {
      problems.push(`${where}: a tool slug is plane_<resource>_<action> in snake_case`);
      continue;
    }
    if (seen.has(entry.toolSlug)) problems.push(`${where}: listed twice`);
    seen.add(entry.toolSlug);

    if (typeof entry.resource !== "string" || typeof entry.action !== "string") {
      problems.push(`${where}: resource and action are required`);
      continue;
    }
    if (entry.toolSlug !== `plane_${entry.resource}_${entry.action}`) {
      problems.push(
        `${where}: the slug does not match resource "${entry.resource}" and action "${entry.action}"`,
      );
    }

    const id = `${entry.resource}.${entry.action}`;
    const action = actions.get(id);
    if (action === undefined) {
      problems.push(`${where}: the pinned release declares no ${id} action`);
      continue;
    }
    if (action.requestShape !== "single") {
      problems.push(
        `${where}: ${id} is a ${action.requestShape} request in the pin ` +
          `(${action.requestLines} request line(s)${action.loops ? ", in a loop" : ""}), so it is not one ` +
          "endpoint; leave it out, or say so in excluded",
      );
    }
    if (!prose(entry.reason)) {
      problems.push(`${where}: reason must be at least 12 characters saying why this tool ships`);
    }

    if (typeof entry.wave !== "string" || !waveNames.has(entry.wave)) {
      problems.push(`${where}: wave "${String(entry.wave)}" is not one of ${[...waveNames].join(", ")}`);
    } else if (waves[entry.wave]?.status !== "reviewed") {
      problems.push(`${where}: wave ${entry.wave} is not marked reviewed`);
    }

    const endpoint = endpoints[entry.toolSlug];
    if (endpoint === undefined) {
      problems.push(`${where}: no endpoint in scripts/plane/endpoints.mjs`);
      continue;
    }

    // The endpoint's evidence: it must be a call site the pin recorded. More than
    // one call site is not by itself fatal here - an entry may name the one whose
    // endpoint we ship - but it is worth seeing in the docs.
    const calls = action.sdkCalls ?? [];
    if (calls.length === 0) {
      problems.push(`${where}: the pin recorded no SDK call for ${id}, so its endpoint is unproven`);
    } else if (!calls.includes(endpoint.sdk)) {
      problems.push(
        `${where}: endpoints.mjs names "${endpoint.sdk}", which ${id} does not call (${calls.join(", ")})`,
      );
    } else if (calls.length > 1) {
      warnings.push(`${where}: ${id} calls ${calls.join(" and ")}; the endpoint covers ${endpoint.sdk}`);
    }

    const { method } = endpoint;
    const methods =
      typeof method === "string" ? [method] : Object.values(method.cases).map((variant) => variant.method);
    if (action.read && methods.some((name) => name !== "GET")) {
      problems.push(`${where}: ${id} is a read, so every variant must be a GET (found ${methods.join(", ")})`);
    }
    if (!action.read && methods.every((name) => name === "GET")) {
      problems.push(`${where}: ${id} writes, so it cannot be a GET`);
    }

    // `flowNote`: the cases where "one action is one request" needs explaining.
    const narrowed = Array.isArray(endpoint.requireArgs) ? endpoint.requireArgs.join(", ") : "";
    const forked = typeof endpoint.path === "object" ? `, path chosen by ${endpoint.path.arg}` : "";
    const needsFlowNote =
      narrowed !== "" || forked !== "" || action.branch !== "own" || action.requestLines > 1 || action.loops === true;
    if (needsFlowNote && !prose(entry.flowNote)) {
      problems.push(
        `${where}: ${id} is not a plain single request (branch ${action.branch}, ` +
          `${action.requestLines} request line(s)${action.loops ? ", in a loop" : ""}` +
          `${narrowed === "" ? "" : `, narrowed by ${narrowed}`}${forked}); ` +
          "add a flowNote saying what ships and what does not",
      );
    }

    if (entry.destructive === true) {
      if (!prose(entry.destructiveReason)) {
        problems.push(`${where}: marking a tool destructive needs a destructiveReason`);
      }
      if (!methods.includes("DELETE") && action.destructive !== true) {
        warnings.push(
          `${where}: destructive is set, but neither the vendor's flag nor the method removes anything`,
        );
      }
    } else if (action.destructive === true) {
      problems.push(
        `${where}: the vendor marks ${id} destructive, so ship it as destructive: true with a destructiveReason`,
      );
    }

    // Every declared argument has to reach the request, exactly once, and the
    // request may only name arguments the action declares. That is the rule that
    // catches the quiet failure mode of this table: a field written under the
    // wrong name never arrives, and the API answers 200 anyway.
    const { declared, paths, placeholders, queries, bodyArgs, chosenBy } = argumentRoles({ action, endpoint });
    const dropped = new Set(entry.dropArgs ?? []);
    // A variant path is chosen by one of the arguments: it is not interpolated,
    // but it does reach the request, as the choice of endpoint.
    if (chosenBy !== undefined && !declared.includes(chosenBy)) {
      problems.push(`${where}: the path is chosen by "${chosenBy}", which ${id} does not declare`);
    }
    if (chosenBy !== undefined) {
      const choices = Object.keys(endpoint.path.cases);
      if (!prose(entry.variantNote)) {
        problems.push(`${where}: the path is chosen by "${chosenBy}"; add a variantNote naming the branches`);
      }
      const declaredChoice = (action.optional ?? []).includes(chosenBy);
      if (!declaredChoice && (action.requires ?? []).every((name) => name !== chosenBy)) {
        warnings.push(`${where}: ${chosenBy} chooses the endpoint but the pin does not declare it`);
      }
      warnings.push(`${where}: the endpoint depends on ${chosenBy} being one of ${choices.join(", ")}`);
    }

    if (!paths.some((path) => path.includes("{workspace}"))) {
      if (endpoint.noWorkspace !== true) {
        problems.push(`${where}: the path names no workspace; add noWorkspace: true if that is deliberate`);
      }
    } else if (endpoint.noWorkspace === true) {
      warnings.push(`${where}: noWorkspace is set but the path names {workspace}`);
    }
    for (const name of placeholders) {
      if (name !== "workspace" && !declared.includes(name)) {
        problems.push(`${where}: the path names {${name}}, which ${id} does not declare`);
      }
    }
    for (const name of [...queries, ...bodyArgs, ...dropped]) {
      if (!declared.includes(name)) {
        problems.push(`${where}: "${name}" is used by the endpoint, but ${id} does not declare it`);
      }
    }
    if (dropped.size > 0 && !prose(entry.dropNote)) {
      problems.push(`${where}: dropping an argument needs a dropNote saying where it went`);
    }
    for (const name of declared) {
      if (placeholders.has(name) || queries.includes(name) || bodyArgs.includes(name) || dropped.has(name)) continue;
      if (name === chosenBy) continue;
      problems.push(
        `${where}: ${id} declares "${name}", but the endpoint never sends it; put it in the path, the query or ` +
          "the body, or drop it with a dropNote",
      );
    }

    entries.push({ ...entry, action, endpoint });
  }

  for (const slug of Object.keys(endpoints)) {
    if (!seen.has(slug)) problems.push(`${slug}: has an endpoint in endpoints.mjs but is not allowlisted`);
  }

  // The other half of the review: what we deliberately left out, and why. An entry
  // has to name something the pin actually declares, and cannot also ship.
  const excluded = Array.isArray(document.excluded) ? document.excluded : [];
  const excludedIds = new Set();
  for (const entry of excluded) {
    const where = typeof entry.id === "string" ? entry.id : JSON.stringify(entry.id);
    if (typeof entry.id !== "string" || !ACTION_ID.test(entry.id)) {
      problems.push(`${where}: an excluded entry names <resource>.<action>`);
      continue;
    }
    if (!actions.has(entry.id)) {
      problems.push(`${where}: the pinned release declares no such action`);
      continue;
    }
    excludedIds.add(entry.id);
    if (!prose(entry.why)) problems.push(`${where}: why must be at least 12 characters`);
    const action = actions.get(entry.id);
    // The heavy cases repeat one rule many times over - 44 actions are more than
    // one request - so an entry may name the rule in `rule` and leave the sentence
    // to the docs instead of writing it out 44 times.
    if (!prose(entry.rule) && action.requestShape !== "none" && !prose(entry.why)) {
      warnings.push(`${where}: no rule; the docs will print the shape the pin recorded`);
    }
  }

  for (const entry of entries) {
    const id = `${entry.resource}.${entry.action}`;
    if (excludedIds.has(id)) problems.push(`${entry.toolSlug}: both allowlisted and excluded (${id})`);
  }

  // Nothing may fall through the cracks. Every action the pin declares is either
  // shipped, deliberately excluded, or waiting in `pending` for its own review -
  // and a re-pin that adds an action trips this rather than shipping nothing.
  const pending = Array.isArray(document.pending) ? document.pending : [];
  const pendingIds = new Set();
  for (const id of pending) {
    if (typeof id !== "string" || !ACTION_ID.test(id)) {
      problems.push(`${JSON.stringify(id)}: a pending entry names <resource>.<action>`);
      continue;
    }
    if (!actions.has(id)) {
      problems.push(`${id}: pending, but the pinned release declares no such action`);
      continue;
    }
    pendingIds.add(id);
  }
  for (const id of pendingIds) {
    if (excludedIds.has(id)) problems.push(`${id}: both pending and excluded`);
  }
  for (const id of actions.keys()) {
    if (seen.has(`plane_${id.replace(".", "_")}`)) continue;
    if (excludedIds.has(id) || pendingIds.has(id)) continue;
    problems.push(`${id}: neither allowlisted, excluded, nor pending; decide what it is`);
  }

  return {
    document,
    entries,
    excluded,
    bySlug: new Map(entries.map((entry) => [entry.toolSlug, entry])),
    problems,
    warnings,
  };
}
