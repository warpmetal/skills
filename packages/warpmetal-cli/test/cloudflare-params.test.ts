/**
 * cloudflare-params.test.ts - every generated Cloudflare builder, asserted
 * against the operation it claims to call in the Cloudflare API.
 *
 * The other suites cannot catch a wrong route or a dropped argument.
 * `mcp-request-contract` compares each builder against a fixture generated from
 * that same builder, so a mistake is copied into both sides; and a live call
 * cannot see it either, because Cloudflare ignores a query parameter it does not
 * know - `?shadowing_name=` answers 200 while filtering nothing.
 *
 * This suite closes that gap offline against the published spec, distilled into
 * `fixtures/cloudflare-params.json` (see scripts/gen-cloudflare-params.mjs; the
 * 27 MB spec itself is scratch and is not committed). For each tool it checks
 * the host, the method, the path template, that every emitted query key is
 * declared by that operation, that declared enums are respected, that no
 * declared argument is dead, and that the body carries exactly the fields the
 * operation declares.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { MCP_TOOL_DEFS } from "../src/integration/mcp-tools/catalog.ts";
import type { McpToolRequest } from "../src/integration/mcp-tools/types.js";

interface Parameter {
  readonly name: string;
  readonly arg: string;
  readonly required: boolean;
  readonly type?: string;
  readonly collection?: string;
  readonly enum?: readonly string[];
}

interface Operation {
  readonly toolSlug: string;
  readonly method: string;
  readonly path: string;
  readonly summary: string;
  readonly auth: string;
  readonly destructive: boolean;
  readonly filtered: boolean;
  readonly keepFiltered: boolean;
  readonly bodyKind: string;
  readonly pathParams: readonly Parameter[];
  readonly queryParams: readonly Parameter[];
  readonly bodyFields: readonly Parameter[];
  readonly tokenGroups: readonly string[];
}

interface ParamsFixture {
  readonly version: number;
  readonly note: string;
  readonly source: {
    readonly title: string;
    readonly version: string;
    readonly servers: readonly string[];
    readonly document: string;
    readonly reference: string;
    readonly sha256: string;
    readonly operations: number;
    readonly reviewable: number;
  };
  readonly tools: Record<string, Operation>;
}

const here = dirname(fileURLToPath(import.meta.url));
const requestFixtures = join(here, "fixtures/mcp-requests");

const params = JSON.parse(
  readFileSync(join(here, "fixtures/cloudflare-params.json"), "utf8"),
) as ParamsFixture;
const sampleArgs = JSON.parse(
  readFileSync(join(requestFixtures, "sample-args.json"), "utf8"),
) as Record<string, Record<string, unknown>>;
const sampleCtx = JSON.parse(
  readFileSync(join(requestFixtures, "sample-ctx.json"), "utf8"),
) as Record<string, Record<string, string>>;

const API_HOST = new URL(params.source.servers[0] ?? "https://api.cloudflare.com/client/v4").host;
/** Cloudflare serves everything under `/client/v4`, so a path template is relative to that. */
const API_BASE_PATH = new URL(params.source.servers[0] ?? "https://api.cloudflare.com/client/v4")
  .pathname;
const defs = MCP_TOOL_DEFS.filter((def) => def.provider === "cloudflare");

function build(slug: string, args: Record<string, unknown>): McpToolRequest {
  const def = defs.find((entry) => entry.toolSlug === slug);
  assert.ok(def, `${slug} must be a cloudflare tool`);
  return def.build({ args, ctx: sampleCtx.cloudflare ?? {} });
}

/** `/zones/{zone_id}/dns_records` -> an anchored regex, under the server base. */
function templateToRegex(template: string): RegExp {
  const base = API_BASE_PATH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = template
    .split("/")
    .map((segment) =>
      /^\{[^}]+\}$/.test(segment) ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("/");
  return new RegExp(`^${base}${body}$`);
}

describe("cloudflare request shapes match the published API", () => {
  it("covers exactly the shipped cloudflare tools", () => {
    const covered = Object.keys(params.tools).sort();
    assert.deepEqual(
      covered,
      defs.map((def) => def.toolSlug).sort(),
      "the distilled spec and the CLI catalog must list the same tools",
    );
    assert.ok(
      covered.length >= 40,
      `expected the wave to be substantial, found ${covered.length}`,
    );
  });

  it("every distilled operation carries the reviewed flags", () => {
    for (const operation of Object.values(params.tools)) {
      assert.ok(operation.summary.length > 0, `${operation.toolSlug}: no summary`);
      assert.ok(
        operation.auth === "api-token" || operation.auth === "none",
        `${operation.toolSlug}: unexpected auth ${operation.auth}`,
      );
      if (operation.filtered) {
        assert.equal(
          operation.keepFiltered,
          true,
          `${operation.toolSlug}: a spec-hidden operation must be a reviewed exception`,
        );
      }
      if (operation.bodyKind === "unsupported") {
        assert.fail(`${operation.toolSlug}: an unsupported body must never ship`);
      }
    }
  });

  for (const def of defs) {
    it(`${def.toolSlug} calls the documented route`, () => {
      const operation = params.tools[def.toolSlug]!;
      const request = build(def.toolSlug, sampleArgs[def.toolSlug] ?? {});
      const url = new URL(request.url);

      assert.equal(request.method, operation.method, `${def.toolSlug}: method`);
      assert.equal(url.host, API_HOST, `${def.toolSlug}: host`);
      assert.match(
        url.pathname,
        templateToRegex(operation.path),
        `${def.toolSlug}: ${url.pathname} is not ${operation.method} ${operation.path}`,
      );
      assert.ok(
        !url.pathname.includes("{") && !url.pathname.includes("}"),
        `${def.toolSlug}: a path parameter was left unsubstituted in ${url.pathname}`,
      );

      // The anti-invention check: a key the operation does not declare is
      // silently ignored by Cloudflare, so only the spec can catch it.
      const declared = new Set(operation.queryParams.map((parameter) => parameter.name));
      const unknown = [...new Set(url.searchParams.keys())].filter((key) => !declared.has(key));
      assert.deepEqual(
        unknown,
        [],
        `${def.toolSlug}: these query parameters are not declared by ${operation.path}: ${unknown.join(", ")}`,
      );

      for (const [key, value] of url.searchParams) {
        const parameter = operation.queryParams.find((entry) => entry.name === key);
        if (parameter?.enum) {
          assert.ok(
            parameter.enum.includes(value),
            `${def.toolSlug}: ${key}=${value} is not one of ${parameter.enum.join(", ")}`,
          );
        }
      }

      if (operation.auth === "none") {
        assert.ok(
          !JSON.stringify(request).includes("__TOKEN__"),
          `${def.toolSlug}: a public operation must not carry a token placeholder`,
        );
      } else {
        assert.equal(
          request.headers?.Authorization,
          "Bearer __TOKEN__",
          `${def.toolSlug}: API-token auth must travel in the Authorization header`,
        );
      }
    });

    it(`${def.toolSlug} wires every declared argument to the request`, () => {
      const operation = params.tools[def.toolSlug]!;

      // Two ways an argument can be dead: the schema offers a property no part
      // of the request consumes, or a declared parameter never reaches the URL
      // because the builder forgot to interpolate it. The second is invisible in
      // a fixture generated from the same builder, and the sample value for an
      // array is empty (which `qs` skips on purpose), so each query argument is
      // given a sentinel value here instead.
      const declared = new Set<string>([
        ...operation.pathParams.map((parameter) => parameter.arg),
        ...operation.queryParams.map((parameter) => parameter.arg),
        ...operation.bodyFields.map((field) => field.arg),
      ]);
      const orphans = Object.keys(sampleArgs[def.toolSlug] ?? {}).filter(
        (property) => !declared.has(property),
      );
      assert.deepEqual(
        orphans,
        [],
        `${def.toolSlug}: these schema properties have nowhere to go: ${orphans.join(", ")}`,
      );

      for (const parameter of operation.queryParams) {
        const args = {
          ...(sampleArgs[def.toolSlug] ?? {}),
          [parameter.arg]: parameter.type === "array" ? ["wm-a"] : "wm-value",
        };
        const url = new URL(build(def.toolSlug, args).url);
        assert.ok(
          url.searchParams.has(parameter.name),
          `${def.toolSlug}: ${parameter.name} never reaches the URL`,
        );
      }

      for (const parameter of operation.pathParams) {
        const args = { ...(sampleArgs[def.toolSlug] ?? {}), [parameter.arg]: "wm-path-value" };
        const url = new URL(build(def.toolSlug, args).url);
        assert.ok(
          url.pathname.includes("wm-path-value"),
          `${def.toolSlug}: ${parameter.name} never reaches the path`,
        );
      }
    });

    it(`${def.toolSlug} sends the body fields the operation declares`, () => {
      const operation = params.tools[def.toolSlug]!;
      const request = build(def.toolSlug, sampleArgs[def.toolSlug] ?? {});
      if (operation.bodyKind !== "object") {
        assert.equal(request.body, undefined, `${def.toolSlug}: an unexpected body was sent`);
        return;
      }
      const body = new Set(Object.keys((request.body ?? {}) as Record<string, unknown>));
      const invented = [...body].filter(
        (key) => !operation.bodyFields.some((field) => field.name === key),
      );
      assert.deepEqual(invented, [], `${def.toolSlug}: body fields the spec does not declare`);
      const missing = operation.bodyFields
        .map((field) => field.name)
        .filter((name) => !body.has(name));
      assert.deepEqual(
        missing,
        [],
        `${def.toolSlug}: declared body fields that never reach the request`,
      );
    });
  }

  it("joins a csv query collection with commas", () => {
    let checked = 0;
    for (const def of defs) {
      const operation = params.tools[def.toolSlug]!;
      for (const parameter of operation.queryParams) {
        if (parameter.type !== "array") continue;
        assert.equal(
          parameter.collection,
          "csv",
          `${def.toolSlug}: an array named ${parameter.name} has an unhandled collection`,
        );
        const args = { ...(sampleArgs[def.toolSlug] ?? {}), [parameter.arg]: ["wm-a", "wm-b"] };
        const url = new URL(build(def.toolSlug, args).url);
        assert.deepEqual(
          url.searchParams.getAll(parameter.name),
          ["wm-a,wm-b"],
          `${def.toolSlug}: ${parameter.name} is a csv collection and must be sent once, comma-joined`,
        );
        checked += 1;
      }
    }
    assert.ok(checked > 0, "expected at least one array query parameter in the wave");
  });

  it("gates every mutating tool and leaves the reads ungated", () => {
    for (const def of defs) {
      const operation = params.tools[def.toolSlug]!;
      const mutating = operation.method !== "GET";
      assert.equal(def.mutating, mutating, `${def.toolSlug}: mutating`);
      if (mutating) {
        assert.equal(
          def.gate,
          `CONFIRM CLOUDFLARE ${def.verb.toUpperCase().replace(/-/g, " ")}`,
          `${def.toolSlug}: a write must carry the provider's confirm gate`,
        );
      } else {
        assert.equal(def.gate, undefined, `${def.toolSlug}: a read must not be gated`);
      }
    }
  });
});
