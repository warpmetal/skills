/**
 * plane-catalog.test.ts - the reviewed invariants of the Plane surface, asserted on
 * the catalog itself and against the pin it was built from.
 *
 * The CLI's suites prove each builder calls the reviewed route. This one covers
 * what the catalog promises before a request exists: that every description names
 * the endpoint, that the annotations agree with the method, that the workspace slug
 * is context rather than an argument, and - the one that matters most for this
 * provider - that the catalog's arguments are exactly the arguments the pinned
 * release declares for that action, which is the fact no spec could have told us.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  DESTRUCTIVE_SLUGS,
  findProviderToolMapping,
  loadProviderCatalog,
} from "../src/providers/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const inventory = JSON.parse(
  readFileSync(join(here, "../../warpmetal-cli/scripts/plane/inventory.json"), "utf8"),
) as {
  readonly source: { readonly tag: string };
  readonly tools: readonly {
    readonly tool: string;
    readonly actions: readonly {
      readonly name: string;
      readonly requires: readonly string[];
      readonly optional: readonly string[];
      readonly read: boolean;
      readonly destructive: boolean;
    }[];
  }[];
};

/** The pin's actions, by `<resource>.<action>`. */
const actions = new Map(
  inventory.tools.flatMap((tool) => tool.actions.map((action) => [`${tool.tool}.${action.name}`, action])),
);

const tools = loadProviderCatalog().filter((tool) => tool.toolkitId === "plane");

test("the plane catalog is not empty and every slug names a pinned action", () => {
  assert.ok(tools.length > 0, "no plane tools in the catalog");
  for (const tool of tools) {
    assert.match(tool.toolSlug, /^plane_[a-z0-9]+(_[a-z0-9]+)*$/, `${tool.toolSlug} is not a plane slug`);
    const id = tool.toolSlug.replace(/^plane_/, "");
    assert.ok(
      [...actions.keys()].some((key) => key.replace(/\./g, "_") === id),
      `${tool.toolSlug} does not name an action the pin declares`,
    );
  }
  assert.equal(new Set(tools.map((tool) => tool.toolSlug)).size, tools.length);
});

test("every plane description names the endpoint it calls", () => {
  for (const tool of tools) {
    assert.ok(
      /(GET|POST|PATCH|PUT|DELETE) \/(users|workspaces)\//.test(tool.description),
      `${tool.toolSlug}: the description does not name the endpoint: ${tool.description}`,
    );
    assert.ok(
      tool.description.includes("api.plane.so") === false,
      `${tool.toolSlug}: the description repeats the origin; the map documents it once`,
    );
  }
});

test("the catalog's arguments are exactly the arguments the pin declares", () => {
  for (const tool of tools) {
    const id = tool.toolSlug.replace(/^plane_/, "").replace(/_/g, ".");
    const action = [...actions.entries()].find(([key]) => key.replace(/\./g, "_") === tool.toolSlug.replace(/^plane_/, ""))?.[1];
    assert.ok(action, `${tool.toolSlug}: no action in the pin`);
    const declared = [...action.requires, ...action.optional].sort();
    const published = Object.keys(tool.inputSchema.properties ?? {}).sort();
    assert.deepEqual(published, declared, `${tool.toolSlug} (${id}): arguments drifted from the pin`);
    assert.deepEqual(
      [...(tool.inputSchema.required ?? [])].sort(),
      [...action.requires].sort(),
      `${tool.toolSlug}: the required set drifted from the pin`,
    );
  }
});

test("the workspace slug is context, never an argument", () => {
  for (const tool of tools) {
    const properties = Object.keys(tool.inputSchema.properties ?? {});
    assert.ok(
      !properties.includes("workspace") && !properties.includes("workspace_slug"),
      `${tool.toolSlug}: a caller must not be able to name the workspace`,
    );
    assert.equal(
      tool.inputSchema.additionalProperties,
      false,
      `${tool.toolSlug}: an undeclared argument must be refused`,
    );
  }
});

test("the annotations follow the method, and nothing in this wave is destructive", () => {
  for (const tool of tools) {
    const mapping = findProviderToolMapping(tool.toolSlug);
    assert.ok(mapping, `${tool.toolSlug}: no provider mapping`);
    assert.equal(mapping.provider, "plane");
    if (tool.annotations.readOnlyHint === true) {
      assert.equal(mapping.mutating, false, `${tool.toolSlug}: a read must not be mutating`);
      assert.equal(mapping.gate, undefined, `${tool.toolSlug}: a read must not be gated`);
      assert.equal(tool.annotations.idempotentHint, true, `${tool.toolSlug}: a GET is idempotent`);
    } else {
      assert.equal(mapping.mutating, true, `${tool.toolSlug}: a write must be mutating`);
      assert.ok(mapping.gate, `${tool.toolSlug}: a write must carry the provider's confirm gate`);
    }
    assert.equal(
      tool.annotations.destructiveHint === true,
      DESTRUCTIVE_SLUGS.has(tool.toolSlug),
      `${tool.toolSlug}: destructiveHint and DESTRUCTIVE_SLUGS disagree`,
    );
  }
});
