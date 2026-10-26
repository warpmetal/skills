/**
 * verify-dsh-plugin.mjs - validates the generated DeepSeek Harness bundle.
 *
 * Skipped when the artifact is absent (it is gitignored and built on demand).
 * These are local shape and consistency checks: whether a host accepts the
 * bundle is decided by `dsh plugin add` and the profile boot, not here. Run it
 * after `npm run build:dsh-plugin`.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { buildRegistryModel, jsonText } from "./lib/build.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const pluginRoot = join(root, "plugins", "warpmetal-dsh");
const skillsRoot = join(pluginRoot, "skills");
const nodeModules = join(pluginRoot, "server", "node_modules");

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function readText(path) {
  return readFile(path, "utf8").catch(() => null);
}

if (!(await exists(pluginRoot))) {
  console.log(
    "verify-dsh-plugin: skipped (plugins/warpmetal-dsh not built; run npm run build:dsh-plugin)",
  );
  process.exit(0);
}

// 1. Required files: what the patch rows reference, plus the embedded server.
for (const file of ["index.js", "skills.js", "cordis.patch.yml", "package.json", "README.md"]) {
  check(await exists(join(pluginRoot, file)), `plugins/warpmetal-dsh/${file} is missing`);
}
check(
  await exists(join(pluginRoot, "server", "dist", "index.js")),
  "server/dist/index.js is missing; run npm run build:dsh-plugin",
);
check(await exists(nodeModules), "server/node_modules is missing; run npm run build:dsh-plugin");

const manifest = JSON.parse((await readText(join(pluginRoot, "package.json"))) ?? "{}");
const exportsMap = manifest.exports ?? {};
const patch = (await readText(join(pluginRoot, "cordis.patch.yml"))) ?? "";

// 2. The packed registry is the artifact's own, and it is current.
try {
  const model = await buildRegistryModel({ root: pluginRoot });
  const registryText = await readText(join(pluginRoot, "registry.json"));
  check(registryText === jsonText(model), "registry.json is stale; run npm run build:dsh-plugin");

  const repoModel = await buildRegistryModel({ root });
  check(
    model.skills.length === repoModel.skills.length,
    `the bundle ships ${String(model.skills.length)} skills but the registry declares ${String(repoModel.skills.length)}`,
  );
  for (const skill of repoModel.skills) {
    check(
      model.skills.some((shipped) => shipped.name === skill.name),
      `skills/${skill.name} is missing from the bundle`,
    );
    check(
      await exists(join(skillsRoot, skill.name, "SKILL.md")),
      `skills/${skill.name}/SKILL.md is missing`,
    );
    check(
      await exists(join(skillsRoot, skill.name, "skill.json")),
      `skills/${skill.name}/skill.json is missing`,
    );
  }
} catch (error) {
  failures.push(`registry invalid: ${error.message}`);
}

// 3. The manifest is what an installer reads.
check(manifest.name === "@warpmetal/dsh-plugin", "package.json name must be @warpmetal/dsh-plugin");
check(
  manifest.dsh?.bundle?.patch === "./cordis.patch.yml",
  "package.json must declare dsh.bundle.patch",
);
check(
  typeof manifest.version === "string" && manifest.version.length > 0,
  "package.json version is missing",
);
for (const file of ["index.js", "skills.js", "cordis.patch.yml", "skills", "server", "registry.json"]) {
  check(manifest.files?.includes(file) === true, `package.json files must include ${file}`);
}
check(manifest.dependencies === undefined, "the bundle must not carry runtime dependencies");
check(manifest.peerDependencies === undefined, "the bundle must not carry peer dependencies");
check(exportsMap["."] === "./index.js", 'package.json exports["."] must be ./index.js');
check(exportsMap["./skills"] === "./skills.js", 'package.json exports["./skills"] must be ./skills.js');

// 4. `engines.dsh` is a range, and the installed harness has to satisfy it.
const engineRange = (manifest.engines ?? {}).dsh;
const rangeMatch = /^>=(\S+)\s+<(\S+)$/.exec(engineRange ?? "");
check(rangeMatch !== null, `package.json engines.dsh must be ">=x <y" (found ${String(engineRange)})`);
const installedDsh = await detectDshVersion();
if (rangeMatch && installedDsh !== null) {
  check(
    compareVersions(installedDsh, rangeMatch[1]) >= 0 && compareVersions(installedDsh, rangeMatch[2]) < 0,
    `engines.dsh ${String(engineRange)} does not admit the installed DSH ${installedDsh}`,
  );
} else if (rangeMatch) {
  console.log("verify-dsh-plugin: no DSH installation found; skipped the engines.dsh range check");
}

// 5. Patch shape: three rows, the Loader's interpolation rules, no literals.
const ids = [...patch.matchAll(/^\s*-\s*id:\s*(\S+)\s*$/gm)].map((match) => match[1]);
check(
  JSON.stringify(ids) === JSON.stringify(["warpmetal-local", "warpmetal-skills", "mcp-warpmetal"]),
  `cordis.patch.yml must insert warpmetal-local, warpmetal-skills and mcp-warpmetal in that order (found ${ids.join(", ")})`,
);
check(/serverName: warpmetal$/m.test(patch), "cordis.patch.yml must set serverName: warpmetal");
check(/transport: stdio$/m.test(patch), "cordis.patch.yml must use the stdio transport");
check(/inject: \[warpmetalLocal\]/m.test(patch), "the MCP row must inject warpmetalLocal");
check(/^\s*env: \{\}$/m.test(patch), "the MCP row must not pass an environment");
check(/failOnStartupError: false$/m.test(patch), "the MCP row must not fail activation on a dead server");

const dynamicLines = patch
  .split(/\r?\n/)
  .filter((line) => !line.trimStart().startsWith("#") && line.includes("!!js"));
check(
  JSON.stringify(dynamicLines.map((line) => line.trim().replace(/^(\w+):.*$/, "$1"))) ===
    JSON.stringify(["command", "args", "cwd"]),
  "the only !!js values may be command, args and cwd",
);
for (const line of dynamicLines) {
  // `!!js` is interpolated inside `config` alone (docs/cordis-primer.md).
  check(/^ {8}\w+: !!js ctx\.warpmetalLocal\.(?:command|args|root)$/.test(line), `unexpected !!js form: ${line.trim()}`);
  check(/ctx\.warpmetalLocal\./.test(line), `!!js must read the service: ${line.trim()}`);
}
check(!/[A-Za-z]:\\/.test(patch), "cordis.patch.yml must not contain an absolute Windows path");
check(!/server[\\/]dist/.test(patch), "cordis.patch.yml must not contain a server path literal");
for (const line of patch.split(/\r?\n/)) {
  if (line.trimStart().startsWith("#")) continue;
  check(
    !/\b[A-Z_]*(?:KEY|SECRET|TOKEN|PASSWORD)[A-Z_]*\s*:/i.test(line),
    `cordis.patch.yml must not declare a credential-shaped key: ${line.trim()}`,
  );
}

// 6. Plugin shape: a namespace module per row, no default export (postmortem 0001).
for (const file of ["index.js", "skills.js"]) {
  const path = join(pluginRoot, file);
  if (!(await exists(path))) continue;
  try {
    execFileSync(process.execPath, ["--check", path], { stdio: "pipe" });
  } catch (error) {
    failures.push(`${file} does not parse: ${error.message.split("\n")[0]}`);
  }
  const source = (await readText(path)) ?? "";
  check(/^export const name = /m.test(source), `${file} must export a plugin name`);
  check(/^export (?:async )?function apply\(/m.test(source), `${file} must export apply()`);
  check(!/^export default /m.test(source), `${file} must not have a default export`);
}
const skillsSource = (await readText(join(pluginRoot, "skills.js"))) ?? "";
check(/^export const inject = \["skills"\]/m.test(skillsSource), "skills.js must inject the skills service");

// 6b. The browser artifact. The host loads it as a loader factory whose id is
// the package name; the shipped UI reference forbids importing Harness client
// packages, touching `document.body`, and any second application.
const clientPath = join(pluginRoot, "client.js");
check(await exists(clientPath), "client.js is missing");
check(manifest.files?.includes("client.js") === true, "package.json files must include client.js");
check(exportsMap["./client"] === "./client.js", 'package.json exports["./client"] must be ./client.js');

const clientConfig = manifest.dsh?.client ?? {};
check(clientConfig.platform === "web", 'package.json dsh.client.platform must be "web"');
check(
  clientConfig.immediately === true,
  "package.json dsh.client.immediately must be true, or the row is missing before the first turn",
);
check(
  Array.isArray(clientConfig.inject) &&
    clientConfig.inject.includes("@deepseek-ai/dsh-client-ui-conversation"),
  "package.json dsh.client.inject must order activation after @deepseek-ai/dsh-client-ui-conversation",
);

const clientSource = (await readText(clientPath)) ?? "";
if (clientSource !== "") {
  try {
    execFileSync(process.execPath, ["--check", clientPath], { stdio: "pipe" });
  } catch (error) {
    failures.push(`client.js does not parse: ${error.message.split("\n")[0]}`);
  }

  // Comments restate the rules this file follows, so they legitimately name the
  // things the code must not do. Scan the code only.
  const clientCode = clientSource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  check(
    clientCode.includes("window.__ModuleLoader__.load("),
    "client.js must be a window.__ModuleLoader__.load factory",
  );
  for (const [pattern, reason] of [
    [/require\(\s*["']@deepseek-ai\/dsh-client-/, "must not import Harness client packages"],
    [/document\.body/, "must not append to document.body"],
    [/innerHTML/, "must not write HTML strings"],
    [/eval\(/, "must not evaluate strings"],
    [/<iframe/, "must not embed an iframe"],
  ]) {
    check(!pattern.test(clientCode), `client.js ${reason}`);
  }

  // Load the artifact the way the host does and read the registration list,
  // rather than grepping for keys this file builds at runtime.
  const serverName = /serverName:\s*(\S+)\s*$/m.exec(patch)?.[1] ?? "";
  let client = null;
  try {
    client = loadClientBundle(clientSource);
  } catch (error) {
    failures.push(`client.js did not load as a module factory: ${error.message}`);
  }
  if (client !== null) {
    check(client.id === manifest.name, "the client module id must equal the package name");
    check(Array.isArray(client.plugin.inject) && client.plugin.inject.includes("slots"), "the client plugin must inject slots");
    check(typeof client.plugin.apply === "function", "the client plugin must export apply()");
    const keys = Array.isArray(client.plugin.CARDED_TOOLS) ? [...client.plugin.CARDED_TOOLS] : [];
    check(keys.length > 0, "the client must card at least one WarpMetal tool");
    for (const key of keys) {
      check(
        typeof key === "string" && key.startsWith(`mcp__${serverName}__wm_`),
        `the client cards ${String(key)}, which is not a tool this server registers under serverName ${String(serverName)}`,
      );
    }
  }
}

// 7. Hygiene: no checkout path, no symlinks. Every file the packed registry
// declares has to be on disk, because `skill_read` serves relative resources by
// path and a missing one is a silent 404 for the model.
async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    // The installed dependency tree is not this package's own content, and
    // npm's `.bin` entries are symlinks by design on POSIX.
    if (entry.name === "node_modules") continue;
    if (entry.isSymbolicLink()) {
      out.push({ path, symlink: true });
      continue;
    }
    if (entry.isDirectory()) await walk(path, out);
    else out.push({ path });
  }
  return out;
}

const checkout = root.replaceAll("\\", "/");
for (const file of await walk(pluginRoot)) {
  const rel = relative(root, file.path).split("\\").join("/");
  if (file.symlink) {
    failures.push(`${rel} is a symlink`);
    continue;
  }
  const text = await readText(file.path);
  if (text === null) continue;
  if (text.includes(checkout)) failures.push(`${rel} contains the checkout path`);
}

// The bundle ships the canonical skills, including the payment and renewal
// references the `warpmetal` CLI skill documents: DeepSeek Harness has a shell,
// so those instructions are in scope for the skill itself (user-invoked), while
// the MCP surface exposes no payment tool at all.
try {
  const model = await buildRegistryModel({ root: pluginRoot });
  for (const skill of model.skills) {
    for (const file of skill.files) {
      check(
        await exists(join(skillsRoot, skill.name, file.path)),
        `skills/${skill.name}/${file.path} is declared by the registry but missing`,
      );
    }
  }
} catch (error) {
  failures.push(`shipped skill files invalid: ${error.message}`);
}

if (failures.length > 0) {
  console.error(`verify-dsh-plugin: ${String(failures.length)} problem(s) found`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("verify-dsh-plugin: ok");

/** The desktop installation records its version next to the runtime payload. */
async function detectDshVersion() {  if (process.env.DSH_VERSION) return process.env.DSH_VERSION.trim();
  const candidates = [
    join(process.env.LOCALAPPDATA ?? "", "Programs", "DeepSeek Harness", "resources", "runtime", "primary-runtime", "runtime.json"),
    join(process.env.ProgramFiles ?? "", "DeepSeek Harness", "resources", "runtime", "primary-runtime", "runtime.json"),
  ];
  for (const candidate of candidates) {
    const text = await readText(candidate);
    if (text === null) continue;
    try {
      const parsed = JSON.parse(text);
      const version = parsed.desktopVersion ?? parsed.dshVersion;
      if (typeof version === "string") return version;
    } catch {
      // A malformed file is not a verification result; fall through.
    }
  }
  return null;
}

/** Semver precedence for the two-clause range this manifest uses. */
function compareVersions(left, right) {
  const parse = (value) => {
    const [core, pre] = value.split("-", 2);
    const [major = 0, minor = 0, patch = 0] = core.split(".").map(Number);
    return { major, minor, patch, pre: pre === undefined ? [] : pre.split(".") };
  };
  const a = parse(left);
  const b = parse(right);
  for (const key of ["major", "minor", "patch"]) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  if (a.pre.length === 0 && b.pre.length === 0) return 0;
  if (a.pre.length === 0) return 1;
  if (b.pre.length === 0) return -1;
  for (let index = 0; index < Math.max(a.pre.length, b.pre.length); index += 1) {
    const leftPart = a.pre[index];
    const rightPart = b.pre[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) {
      const difference = Number(leftPart) - Number(rightPart);
      if (difference !== 0) return difference < 0 ? -1 : 1;
      continue;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    if (leftPart !== rightPart) return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

/**
 * Run the browser artifact the way the host does, without a browser: a `window`
 * carrying the module loader and a `require` that answers for react. Throws when
 * the artifact is not a single loader factory, which is the failure this check
 * exists to catch.
 */
function loadClientBundle(source) {
  const modules = [];
  const window = { __ModuleLoader__: { load: (module) => modules.push(module) } };
  const react = { createElement: (type, props, ...children) => ({ type, props, children }), Fragment: "Fragment" };
  const require = (id) => {
    if (id === "react") return react;
    throw new Error(`unexpected require(${id})`);
  };
  vm.runInNewContext(source, { window, require, console });
  if (modules.length !== 1) throw new Error(`expected one module, got ${String(modules.length)}`);
  const [module] = modules;
  return { id: module.id, plugin: module.factory(require) };
}

