#!/usr/bin/env node
import { runCli } from "./dispatch.js";

// A single entry point: everything below dispatch is a pure function of argv
// and injected dependencies, which is what makes the test suite network-free.
runCli(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`warpmetal: unexpected failure: ${String(error)}\n`);
    process.exitCode = 5;
  });
