import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  bareRemoteInterpolations,
  collectSkillPolicyFailures,
  gateLiteralsIn,
  normalizeGate,
  readApprovalGates,
} from "./validate-skills.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

async function makeFixture(files) {
  const root = await mkdtemp(join(tmpdir(), "validate-fixture-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const path = join(root, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  }
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

async function withFixture(files, run) {
  const fixture = await makeFixture(files);
  try {
    return await run(fixture.root);
  } finally {
    await fixture.cleanup();
  }
}

const GATE_TABLE = [
  "# approvals",
  "",
  "## Gate Table",
  "",
  "| Gate | Confirmation string | Enforced by | Immediately before |",
  "|------|--------------------|-------------|--------------------|",
  "| Deploy a new release | `CONFIRM DEPLOY` | `deploy-site/scripts/deploy.sh` | The swap |",
  "| Restore over live data | `CONFIRM RESTORE <client>` | `backup-restore/scripts/restore.sh` | Overwriting |",
  "",
  "---",
  "",
  "## Implementation",
  "",
].join("\n");

test("normalizeGate reduces the two spellings of a placeholder gate to one", () => {
  assert.equal(normalizeGate("CONFIRM RESTORE ${CLIENT}"), "CONFIRM RESTORE");
  assert.equal(normalizeGate("CONFIRM RESTORE <client>"), "CONFIRM RESTORE");
  assert.equal(normalizeGate("CONFIRM  RESTART   WORKERS"), "CONFIRM RESTART WORKERS");
  assert.equal(normalizeGate("CONFIRM DEPLOY"), "CONFIRM DEPLOY");
});

test("gateLiteralsIn reads every form a script declares a gate in", () => {
  const script = [
    'require_confirm "CONFIRM DEPLOY" "DEPLOY" "context"',
    'require_confirms "CONFIRM PRUNE" "PRUNE" "CONFIRM RESTORE ${CLIENT}" "RESTORE"',
    'integration_run_mutating slack notify "CONFIRM NOTIFY" --channel ops',
    'GATES=("CONFIRM BACKUP SETUP" "BACKUP SETUP")',
    'GATES+=("CONFIRM RESTART" "RESTART")',
  ].join("\n");
  assert.deepEqual(
    [...gateLiteralsIn(script)].sort(),
    [
      "CONFIRM BACKUP SETUP",
      "CONFIRM DEPLOY",
      "CONFIRM NOTIFY",
      "CONFIRM PRUNE",
      "CONFIRM RESTART",
      "CONFIRM RESTORE",
    ].sort(),
  );
});

test("gateLiteralsIn joins a backslash continuation", () => {
  const script = 'integration_run_mutating slack notify \\\n    "CONFIRM NOTIFY" --channel ops\n';
  assert.deepEqual([...gateLiteralsIn(script)], ["CONFIRM NOTIFY"]);
});

test("gateLiteralsIn ignores a gate that is only mentioned", () => {
  // verify-workers.sh prints the exact re-run command for a missing gate; those
  // literals name a gate that already exists and must not be read as a
  // declaration, or authors would stop quoting the command an operator needs.
  const script = [
    "# --confirm \"CONFIRM DEPLOY\" documents the flag in a header comment",
    'result_warn "Re-run: bash scripts/setup-workers.sh --confirm \\"CONFIRM SETUP\\""',
    'note "Gates: CONFIRM PRUNE"',
  ].join("\n");
  assert.deepEqual([...gateLiteralsIn(script)], []);
});

test("readApprovalGates reads the real table and finds the gates skills use", async () => {
  const { gates, problem } = await readApprovalGates(REPO_ROOT);
  assert.equal(problem, null);
  for (const gate of ["CONFIRM DEPLOY", "CONFIRM DNS CHANGE", "CONFIRM NOTIFY", "CONFIRM RESTORE"]) {
    assert.ok(gates.includes(gate), `${gate} must be in the authoritative table (got ${gates.join(", ")})`);
  }
});

test("readApprovalGates reports a missing table instead of an empty allowlist", async () => {
  await withFixture({ "conventions/other.md": "# nothing\n" }, async (root) => {
    const { gates, problem } = await readApprovalGates(root);
    assert.deepEqual(gates, []);
    assert.match(problem ?? "", /missing approval table/);
  });
  await withFixture({ "conventions/approvals.md": "# no table here\n" }, async (root) => {
    const { problem } = await readApprovalGates(root);
    assert.match(problem ?? "", /could not locate the gate table/);
  });
});

test("collectSkillPolicyFailures rejects a gate that is not in the table", async () => {
  const files = {
    "conventions/approvals.md": GATE_TABLE,
    "skills/demo/SKILL.md": "---\nname: demo\n---\n\n# demo\n",
    "skills/demo/scripts/good.sh": "# @standalone-remote\nrequire_confirm \"CONFIRM DEPLOY\" \"DEPLOY\" \"ctx\"\n",
    "skills/demo/scripts/bad.sh": "# @standalone-remote\nrequire_confirm \"CONFIRM BOGUS\" \"BOGUS\" \"ctx\"\n",
  };
  await withFixture(files, async (root) => {
    const failures = await collectSkillPolicyFailures({ root });
    assert.ok(
      failures.some((failure) => /bad\.sh uses the gate "CONFIRM BOGUS"/.test(failure)),
      `the invented gate must be reported (got: ${failures.join(" | ")})`,
    );
    assert.ok(
      !failures.some((failure) => /good\.sh/.test(failure)),
      "a gate that is in the table must not be reported",
    );
  });
});

test("bareRemoteInterpolations flags a value inside single quotes and its line", () => {
  const text = [
    "try_rsh \"readlink -f '${SITE_ROOT}/current' 2>/dev/null || true\"",
    "try_rsh \"systemctl restart '${WORKER_UNIT}1'\"",
    "SITE_ROOT=$(remote_quote \"${SITE_ROOT}\")",
  ].join("\n");
  assert.deepEqual(bareRemoteInterpolations(text), [1, 2]);
});

test("bareRemoteInterpolations ignores the sanctioned and out-of-scope forms", () => {
  const text = [
    'try_rsh "readlink -f $(remote_quote "${SITE_ROOT}/current")"',
    "fail_with 3 STOPPED \"SSH host '${HOST}' not found\"",            // message, not in list
    "result_warn \"monitors named '${CLIENT}-*'\"",                    // message, not in list
    "IDENTIFIED BY '${SQL_PW}'",                                       // SQL string, not in list
    "CREATE USER IF NOT EXISTS '${DB_USER_EFFECTIVE}'@'localhost'",    // SQL string, not in list
  ].join("\n");
  assert.deepEqual(bareRemoteInterpolations(text), []);
});
