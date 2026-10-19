import assert from "node:assert/strict";
import test from "node:test";

import { classifyUses, unpinnedActions } from "./check-action-pins.mjs";

test("classifyUses distinguishes local, external, and other refs", () => {
  assert.deepEqual(classifyUses("./.github/workflows/verify.yml"), { kind: "local" });
  assert.deepEqual(classifyUses("actions/checkout@v4"), {
    kind: "external",
    ref: "v4",
    pinned: false,
  });
  assert.deepEqual(classifyUses("actions/checkout@" + "a".repeat(40)), {
    kind: "external",
    ref: "a".repeat(40),
    pinned: true,
  });
  assert.deepEqual(classifyUses("docker://alpine:latest"), { kind: "other" });
});

test("unpinnedActions flags only unpinned external actions", () => {
  const text = [
    "      - uses: actions/checkout@" + "a".repeat(40) + " # v4",
    "      - uses: actions/setup-node@v4",
    "      - uses: ./.github/workflows/verify.yml",
    "      - uses: docker://alpine:latest",
  ].join("\n");
  assert.deepEqual(unpinnedActions(text), [{ line: 2, value: "actions/setup-node@v4" }]);
});
