import { readFile, readdir } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Skill policy checks.
 *
 * These are the rules that are cheaper to enforce mechanically than to review by
 * eye: the shared conventions must not drift between skills, every script must
 * carry the resolver block, and no skill may talk to a provider directly. The
 * integration layer exists so credentials live in exactly one place; a stray
 * `curl` to a provider in a skill script would quietly create a second one.
 *
 * Exported as a function so `scripts/verify.mjs` can fold these into the single
 * gate, and runnable directly so `tools/validate-skills.sh` works standalone.
 */

const MARKER_OPEN = "# >>> agency-lib-resolver";
const MARKER_CLOSE = "# <<< agency-lib-resolver";

/** A script that runs on a client host cannot source this repository's library. */
const STANDALONE_MARKER = "@standalone-remote";

/** Requests to a provider's own API, which must go through the engine instead. */
const PROVIDER_ENDPOINTS = [
  { name: "Cloudflare API", regex: /api\.cloudflare\.com/ },
  { name: "GitHub API", regex: /api\.github\.com/ },
  { name: "Slack API", regex: /(?:slack\.com\/api|hooks\.slack\.com)/ },
];

/** Direct engine invocations that belong in conventions/lib/integration.sh. */
const INLINE_ENGINE_CALLS = [
  { name: "inline `warpmetal integration`", regex: /warpmetal\s+integration\b/ },
  { name: "inline `warpmetal env secret`", regex: /warpmetal\s+env\s+secret\b/ },
];

/**
 * Variables that flow into a *remote shell command* and never into a local
 * message or a SQL string. A single quote immediately before `${VAR}` is the
 * interpolation-injection signature: the value was written on the assumption
 * that a `'` cannot appear in it, and one does. `conventions/lib/ssh.sh`
 * provides `remote_quote` for exactly this, so the fixed form is
 * `$(remote_quote "${VAR}")`.
 *
 * The list is deliberately narrower than "every variable": `HOST`, `CLIENT`,
 * `STACK` and `PHP` also decorate local messages, and the `DB_*`/`SQL_PW`
 * values sit inside SQL string literals where the single quote is SQL syntax,
 * not shell. Those are covered by the migration and the `remote_quote`
 * self-test rather than by this regex, so the gate stays sound.
 */
const REMOTE_SHELL_VARS = [
  "SITE_ROOT", "DOMAIN", "TARGET_ROOT", "TARGET_HOST", "SOURCE_HOST", "TARGET_SSH",
  "SOURCE_SSH", "REPO_URL", "BACKUP_REPO", "HEALTH_URL", "WORKER_UNIT", "APP_UNIT",
  "DEPLOY_USER", "QUEUE_WORKER_USER", "QUEUE_LOG_DIR", "QUEUE_HEALTHCHECK",
  "QUEUE_ALERT_WEBHOOK", "MONITORING_HOST", "MIGRATION_TARGET_ROOT",
  "MIGRATION_MAIL_RELAY", "RELEASES_DIR", "RELEASE_DIR", "MIRROR_DIR", "SHARED_DIR",
  "TARGET_DIR", "TARGET_REF", "BRANCH", "ENV_FILE", "PASS_FILE", "CF_CREDS_PATH",
  "VHOST_PATH", "BACKUP_PATH", "SNAPSHOT", "SCRATCH_DIR",
];

const BARE_REMOTE_INTERPOLATION = new RegExp(
  `'\\$\\{(?:${REMOTE_SHELL_VARS.join("|")})\\}`,
);

/** 1-based line numbers of bare single-quoted interpolations of the list above. */
export function bareRemoteInterpolations(text) {
  const lines = [];
  const split = text.split(/\r?\n/);
  for (let index = 0; index < split.length; index += 1) {
    if (BARE_REMOTE_INTERPOLATION.test(split[index])) lines.push(index + 1);
  }
  return lines;
}

async function listFiles(directory, predicate, into = []) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return into;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await listFiles(path, predicate, into);
    else if (entry.isFile() && predicate(entry.name)) into.push(path);
  }
  return into;
}

async function readIfExists(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * The provider names the CLI actually implements, read from the catalog source.
 *
 * The catalog lives in TypeScript, which this Node-only gate cannot import
 * without a build step, so the `PROVIDERS` literal is read directly. It has two
 * sources of names: the hand-written `name: "…"` entries, and the MCP-backed
 * providers that enter the array as `...MCP_PROVIDERS` and are declared as
 * `mcpProvider("…")` calls above it. Both are collected, because a skill that
 * declares an MCP-backed integration is declaring something the engine really
 * implements. The slice is bounded by the array's own delimiters and a
 * zero-result read is a failure, so a refactor that renames the constant cannot
 * turn this check into a no-op.
 */
export async function readProviderCatalog(root) {
  const path = join(root, "packages/warpmetal-cli/src/integration/registry.ts");
  const source = await readIfExists(path);
  if (source === null) {
    return { providers: [], capabilities: [], problem: `missing catalog: ${relative(root, path)}` };
  }
  // Anchored on the exported declaration: the plain needle
  // `PROVIDERS: readonly ProviderSpec[] = [` is also a substring of
  // `const MCP_PROVIDERS: readonly ProviderSpec[] = [`, which appears earlier in
  // the file. Searching for it landed on that array, whose entries are
  // `mcpProvider(...)` calls and carry no `name:` line, so the gate reported
  // "the PROVIDERS array declares no provider" for a healthy catalog.
  const start = source.indexOf("export const PROVIDERS: readonly ProviderSpec[] = [");
  if (start === -1) {
    return { providers: [], capabilities: [], problem: "could not locate the PROVIDERS array" };
  }
  const end = source.indexOf("\n];", start);
  if (end === -1) {
    return { providers: [], capabilities: [], problem: "the PROVIDERS array is not terminated" };
  }
  const block = source.slice(start, end);
  const literal = [...block.matchAll(/^\s{4}name: "([a-z0-9-]+)",$/gm)].map((match) => match[1]);
  const capabilities = [...block.matchAll(/"([a-z]+\.[a-z]+\.[a-z]+)"/g)].map((match) => match[1]);
  if (literal.length === 0) {
    return { providers: [], capabilities: [], problem: "the PROVIDERS array declares no provider" };
  }
  // Every `mcpProvider(` call must yield a name. A count mismatch means the call
  // shape changed, and reading fewer providers than exist is exactly the silent
  // blindness that let this gate fail unnoticed; report it instead. The pattern
  // is anchored on leading whitespace so the function's own definition does not
  // count as a call site.
  const calls = [...source.matchAll(/^\s+mcpProvider\(/gm)].length;
  const generated = [...source.matchAll(/^\s+mcpProvider\("([a-z0-9-]+)"/gm)].map((match) => match[1]);
  if (calls !== generated.length) {
    return {
      providers: [],
      capabilities: [],
      problem: `read ${String(generated.length)} of ${String(calls)} mcpProvider entries; the catalog format changed`,
    };
  }
  return { providers: [...new Set([...literal, ...generated])], capabilities, problem: null };
}

/**
 * The gate strings the shared contract declares, read from the authoritative
 * table in `conventions/approvals.md`.
 *
 * That table says "A gate string that is not here does not exist", and until
 * this check existed nothing enforced it: `CONFIRM NOTIFY` shipped in
 * `server-monitoring/scripts/test-alert.sh` without ever being listed, so the
 * sentence was an aspiration. The table being unreadable, or yielding no gates
 * at all, is a failure rather than an empty allowlist - a refactor that renamed
 * the heading must not turn this into a check that passes everything.
 */
export async function readApprovalGates(root) {
  const path = join(root, "conventions/approvals.md");
  const source = await readIfExists(path);
  if (source === null) {
    return { gates: [], problem: `missing approval table: ${relative(root, path)}` };
  }
  const start = source.indexOf("## Gate Table");
  const end = start === -1 ? -1 : source.indexOf("\n---", start);
  if (start === -1 || end === -1) {
    return { gates: [], problem: "could not locate the gate table in conventions/approvals.md" };
  }
  const block = source.slice(start, end);
  const gates = [...block.matchAll(/`(CONFIRM [^`]+)`/g)].map((match) => normalizeGate(match[1]));
  if (gates.length === 0) {
    return { gates: [], problem: "the gate table declares no gate" };
  }
  return { gates: [...new Set(gates)], problem: null };
}

/**
 * Reduces a gate to the part that must match.
 *
 * The same gate is spelled two ways: a script writes the interpolated form
 * (`CONFIRM RESTORE ${CLIENT}`) and the table writes the placeholder form
 * (`CONFIRM RESTORE <client>`). Both reduce to `CONFIRM RESTORE`, which is what
 * identifies the gate; the placeholder is the argument, not the gate.
 */
export function normalizeGate(value) {
  return value
    .replace(/\$\{[A-Z0-9_]+\}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Joins backslash continuations so a call whose gate sits on the next line is
 * still read as one statement, and blanks full-line comments.
 */
function logicalLines(text) {
  const out = [];
  let current = "";
  for (const raw of text.split("\n")) {
    const line = raw.trimStart().startsWith("#") ? "" : raw;
    current = current === "" ? line : `${current} ${line.trim()}`;
    if (/\\\s*$/.test(raw)) continue;
    out.push(current);
    current = "";
  }
  if (current !== "") out.push(current);
  return out;
}

/**
 * Gate literals a skill script *declares*, in either quote style.
 *
 * Only the two places a gate is declared count: an argument to one of the gate
 * helpers, and a `GATES=(...)`/`GATES+=(...)` array, which is what the helpers
 * are ultimately called with. A gate merely *mentioned* - `verify-workers.sh`
 * prints the exact re-run command for a missing gate, so those literals appear
 * in a remediation message - is a reference to a gate that already exists, and
 * failing on it would push authors to stop quoting the command an operator
 * needs. Those messages are covered the other way round: the gate they name has
 * to exist, and the check that reads the declarations proves it does.
 */
export function gateLiteralsIn(text) {
  const declares = /(?:^|[^A-Za-z_])(?:require_confirm|require_confirms|require_gate_now|integration_run_mutating)\b/;
  const gateArray = /^[A-Za-z_]*GATES[A-Za-z_]*\+?=\(/;
  const found = new Set();
  for (const line of logicalLines(text)) {
    const trimmed = line.trimStart();
    if (!declares.test(line) && !gateArray.test(trimmed)) continue;
    for (const match of line.matchAll(/(["'])(CONFIRM [^"'\n]*)\1/g)) {
      const gate = normalizeGate(match[2]);
      if (gate.length > 0) found.add(gate);
    }
  }
  return found;
}

export async function collectSkillPolicyFailures({ root }) {
  const failures = [];
  const skillsRoot = join(root, "skills");

  let skillNames;
  try {
    skillNames = (await readdir(skillsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    return [`skills/ is unreadable: ${error.message}`];
  }

  // 1. The shared conventions must be byte-identical in every skill that ships
  //    them, and identical to the canonical `conventions/` at the repository root.
  //    Seven copies exist because a skill directory must work on its own; that is
  //    only safe if the copies cannot drift, so the copies are generated by
  //    `npm run sync:conventions` and any difference is a hand-edit.
  const canonicalDir = join(root, "conventions");
  const canonicalFiles = (await listFiles(canonicalDir, () => true))
    .map((path) => relative(canonicalDir, path).split(sep).join("/"))
    .sort();
  const canonicalContents = new Map();
  for (const file of canonicalFiles) {
    canonicalContents.set(file, await readFile(join(canonicalDir, file), "utf8"));
  }

  for (const name of skillNames) {
    const dir = join(skillsRoot, name, "conventions");
    if (!existsSync(dir)) continue;
    const files = (await listFiles(dir, () => true))
      .map((path) => relative(dir, path).split(sep).join("/"))
      .sort();

    for (const file of canonicalFiles) {
      if (!files.includes(file)) {
        failures.push(`skills/${name}/conventions is missing ${file}; run npm run sync:conventions`);
      }
    }
    for (const file of files) {
      if (!canonicalFiles.includes(file)) {
        failures.push(
          `skills/${name}/conventions/${file} does not exist in the canonical conventions/; run npm run sync:conventions`,
        );
        continue;
      }
      if ((await readFile(join(dir, file), "utf8")) !== canonicalContents.get(file)) {
        failures.push(
          `skills/${name}/conventions/${file} has drifted from conventions/${file}; run npm run sync:conventions`,
        );
      }
    }
  }

  // 2. Every skill script carries the resolver block, the documented contract that
  //    lets a skill directory work standalone. See conventions/client-manifest.md.
  //    The one sanctioned exemption is `@standalone-remote`: a script that is piped
  //    into a client host cannot source anything from the repository, and claiming
  //    otherwise would be a lie the validator should not force.
  for (const skill of skillNames) {
    const scriptDir = join(skillsRoot, skill, "scripts");
    for (const path of await listFiles(scriptDir, (name) => name.endsWith(".sh"))) {
      const text = await readFile(path, "utf8");
      const relativePath = relative(root, path);
      if (text.includes(STANDALONE_MARKER)) continue;
      if (!text.includes(MARKER_OPEN) || !text.includes(MARKER_CLOSE)) {
        failures.push(
          `${relativePath} is missing the agency-lib-resolver marker block (or the @standalone-remote marker)`,
        );
        continue;
      }
      const block = text.slice(text.indexOf(MARKER_OPEN), text.indexOf(MARKER_CLOSE));
      if (!block.includes("AGENCY_LIB")) {
        failures.push(`${relativePath} has a resolver block that does not consult $AGENCY_LIB`);
      }
    }
  }

  // 3. No skill talks to a provider or to the engine directly. The integration
  //    library is the one place allowed to do both, which is the whole point of it.
  for (const skill of skillNames) {
    const skillDir = join(skillsRoot, skill);
    for (const path of await listFiles(skillDir, (name) => name.endsWith(".sh"))) {
      const relativePath = relative(root, path);
      if (relativePath.split(/[\\/]/).includes("lib")) continue;
      const text = await readFile(path, "utf8");
      for (const pattern of PROVIDER_ENDPOINTS) {
        if (pattern.regex.test(text)) {
          failures.push(`${relativePath} calls the ${pattern.name} directly; use conventions/lib/integration.sh`);
        }
      }
      for (const pattern of INLINE_ENGINE_CALLS) {
        if (pattern.regex.test(text)) {
          failures.push(`${relativePath} contains an ${pattern.name}; use conventions/lib/integration.sh`);
        }
      }
    }
  }

  // 4. A declared integration must exist in the catalog. Declaring one the engine
  //    does not implement is worse than declaring none, because an agent would
  //    plan around a capability that is not there.
  const catalog = await readProviderCatalog(root);
  if (catalog.problem !== null) {
    failures.push(`integration catalog is unreadable: ${catalog.problem}`);
  } else {
    for (const skill of skillNames) {
      const metaPath = join(skillsRoot, skill, "skill.json");
      const text = await readIfExists(metaPath);
      if (text === null) continue;
      let meta;
      try {
        meta = JSON.parse(text);
      } catch {
        continue;
      }
      const declared = meta.integrations;
      if (declared === undefined) continue;
      if (!Array.isArray(declared) || declared.some((entry) => typeof entry !== "string")) {
        failures.push(`skills/${skill}/skill.json integrations must be an array of strings`);
        continue;
      }
      for (const provider of declared) {
        if (!catalog.providers.includes(provider)) {
          failures.push(
            `skills/${skill}/skill.json declares integration "${provider}", which is not in the catalog (${catalog.providers.join(", ")})`,
          );
        }
      }
      if (declared.length === 0) {
        failures.push(`skills/${skill}/skill.json integrations is present but empty; remove the field instead`);
      }
    }
  }

  // 5. Every gate a script passes must exist in the authoritative table.
  //    `conventions/approvals.md` claims to be closed ("a gate string that is
  //    not here does not exist"), and a gate the operator is asked to type for
  //    an operation the table does not describe is how a mutating step gets
  //    reviewed as something else.
  const approvals = await readApprovalGates(root);
  if (approvals.problem !== null) {
    failures.push(`approval gate table is unreadable: ${approvals.problem}`);
  } else {
    for (const skill of skillNames) {
      const scriptDir = join(skillsRoot, skill, "scripts");
      for (const path of await listFiles(scriptDir, (name) => name.endsWith(".sh"))) {
        const relativePath = relative(root, path);
        const text = await readFile(path, "utf8");
        for (const gate of gateLiteralsIn(text)) {
          if (!approvals.gates.includes(gate)) {
            failures.push(
              `${relativePath} uses the gate "${gate}", which is not in the conventions/approvals.md gate table`,
            );
          }
        }
      }
    }
  }

  // 6. A value that reaches a remote shell command must never be interpolated
  //    bare inside single quotes: an embedded single quote breaks out of the
  //    literal and the rest of the value becomes command. `remote_quote` is the
  //    one sanctioned spelling.
  for (const skill of skillNames) {
    const scriptDir = join(skillsRoot, skill, "scripts");
    for (const path of await listFiles(scriptDir, (name) => name.endsWith(".sh"))) {
      const relativePath = relative(root, path);
      const text = await readFile(path, "utf8");
      for (const line of bareRemoteInterpolations(text)) {
        failures.push(
          `${relativePath}:${String(line)} interpolates a value inside single quotes; use $(remote_quote "…")`,
        );
      }
    }
  }

  return failures;
}

const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (typeof entry !== "string") return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const failures = await collectSkillPolicyFailures({ root });
  if (failures.length > 0) {
    console.error(`validate-skills: ${failures.length} problem(s) found`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log("validate-skills: ok");
}
