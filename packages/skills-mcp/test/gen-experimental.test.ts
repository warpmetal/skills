/**
 * gen-experimental.test.ts - the derivation the experimental marker depends on.
 *
 * The generator is pure: given the probe verdict rows and the reasoned
 * overrides, it returns the sorted slug set and the reason per slug. These cases
 * pin the boundary the scheduled probe relies on - a 404 is only conclusive when
 * the host is not auth-first or a website/SPA, and a reasoned override survives
 * even though the probe cannot see it.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { deriveExperimental } from "../scripts/gen-experimental.mjs";

test("a non-weak invalid-route is experimental", () => {
  const { slugs, reasons } = deriveExperimental([
    { toolSlug: "acme_flags_list", verdict: "invalid-route", weakSignal: false },
  ]);
  assert.deepEqual(slugs, ["acme_flags_list"]);
  assert.match(reasons["acme_flags_list"], /404\/405/);
});

test("a weak invalid-route (auth-first or SPA host) is not experimental", () => {
  const { slugs } = deriveExperimental([
    { toolSlug: "acme_flags_list", verdict: "invalid-route", weakSignal: true },
  ]);
  assert.deepEqual(slugs, []);
});

test("a reasoned override survives even when its verdict is not a missing route", () => {
  const { slugs, reasons } = deriveExperimental(
    [{ toolSlug: "x_create_posts", verdict: "auth-required", weakSignal: false }],
    { x_create_posts: "a reasoned override" },
  );
  assert.deepEqual(slugs, ["x_create_posts"]);
  assert.equal(reasons["x_create_posts"], "a reasoned override");
});

test("the set is sorted and de-duplicated", () => {
  const { slugs } = deriveExperimental(
    [
      { toolSlug: "z_provider_tool", verdict: "invalid-route", weakSignal: false },
      { toolSlug: "a_provider_tool", verdict: "invalid-route", weakSignal: false },
    ],
    { a_provider_tool: "override reason wins for a_provider_tool" },
  );
  assert.deepEqual(slugs, ["a_provider_tool", "z_provider_tool"]);
});

test("an empty verdict record with no overrides yields no experimental tools", () => {
  assert.deepEqual(deriveExperimental([]), { slugs: [], reasons: {} });
});
