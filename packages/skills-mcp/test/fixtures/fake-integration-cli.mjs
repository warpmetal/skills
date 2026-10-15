#!/usr/bin/env node
/**
 * Fake `@warpmetal/cli integration` for the invoker transport test.
 *
 * It mirrors the real CLI's contract closely enough to exercise the invoker:
 *   - reads provider/verb from argv and the arguments from stdin (`--args-stdin`),
 *   - captures the `--confirm <gate>` flag,
 *   - prints `{ status, results: [{ status, data }] }` on stdout,
 *   - exits with a configurable code to exercise the error mapping.
 *
 * Knobs (read from the environment, inherited through the spawn):
 *   FAKE_CLI_EXIT=4  -> results[0].status = NEEDS_AUTH, exit 4
 *   FAKE_CLI_EXIT=5  -> results[0].status = ERROR,     exit 5
 *   FAKE_CLI_ARRAY=1 -> data.items is an array (array-root provider response)
 */
import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const provider = argv[1] ?? null;
const verb = argv[2] ?? null;

const indexOf = (flag) => argv.indexOf(flag);
const confirmIndex = indexOf("--confirm");
const confirm = confirmIndex === -1 ? null : (argv[confirmIndex + 1] ?? null);

let args = {};
if (argv.includes("--args-stdin")) {
  try {
    args = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    args = {};
  }
}

const exitCode = process.env.FAKE_CLI_EXIT ? Number(process.env.FAKE_CLI_EXIT) : 0;

function emit(document, code) {
  process.stdout.write(`${JSON.stringify(document)}\n`);
  process.exit(code);
}

if (exitCode === 4) {
  emit(
    {
      status: "NEEDS_AUTH",
      provider,
      results: [{ status: "NEEDS_AUTH", warnings: ["fake: credential rejected"] }],
    },
    4,
  );
}

if (exitCode === 5) {
  emit(
    {
      status: "ERROR",
      provider,
      results: [{ status: "ERROR", errors: ["fake: provider rejected the action"] }],
    },
    5,
  );
}

const data = {
  provider,
  verb,
  confirm,
  receivedArgs: args,
  // The whole argv is echoed so the test can prove the payload never rode in it.
  argv,
};

if (process.env.FAKE_CLI_ARRAY === "1") {
  data.items = [{ id: "1" }, { id: "2" }];
}

emit({ status: "OK", provider, results: [{ status: "OK", data }] }, 0);
