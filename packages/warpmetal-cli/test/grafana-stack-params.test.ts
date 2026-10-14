/**
 * grafana-stack-params.test.ts - every Grafana stack builder, asserted against the
 * operation it claims to call in the Grafana HTTP API.
 *
 * The other two suites cannot catch a wrong query name. `mcp-request-contract`
 * compares each builder against a fixture generated from that same builder, so a
 * typo is copied into both sides; `grafana-stack.test.ts` states the request but
 * from the same reading of the API that produced the builder. And a live call
 * cannot see it either: Grafana ignores a query parameter it does not know, so
 * `?dashboardUids=` would answer 200 while filtering nothing - exactly the shape
 * of the Zendesk `sort_by` bug.
 *
 * This suite closes that gap offline against the published spec, distilled into
 * `fixtures/grafana-stack-params.json` (see scripts/gen-grafana-stack-params.mjs;
 * the 700 KB spec itself is scratch and is not committed). For each tool it
 * checks the method, the path template, that every emitted query key is declared
 * by that operation, that declared enums are respected, that no declared
 * argument is dead, and that a `multi` collection repeats the key while a `csv`
 * one joins with commas.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { MCP_TOOL_DEFS } from "../src/integration/mcp-tools/catalog.ts";

interface Parameter {
  readonly name: string;
  readonly in: string;
  readonly type?: string;
  readonly items?: string;
  readonly collectionFormat?: string;
  readonly enum?: readonly string[];
  readonly required?: boolean;
}

interface Operation {
  readonly method: string;
  readonly path: string;
  readonly operationId: string;
  readonly summary?: string;
  readonly parameters: readonly Parameter[];
}

interface ParamsFixture {
  readonly version: number;
  readonly note: string;
  readonly source: {
    readonly title: string;
    readonly version: string;
    readonly document: string;
    readonly reference: string;
  };
  readonly tools: Record<string, Operation>;
}

const here = dirname(fileURLToPath(import.meta.url));
const requestFixtures = join(here, "fixtures/mcp-requests");

const params = JSON.parse(
  readFileSync(join(here, "fixtures/grafana-stack-params.json"), "utf8"),
) as ParamsFixture;
const sampleArgs = JSON.parse(
  readFileSync(join(requestFixtures, "sample-args.json"), "utf8"),
) as Record<string, Record<string, unknown>>;
const sampleCtx = JSON.parse(
  readFileSync(join(requestFixtures, "sample-ctx.json"), "utf8"),
) as Record<string, Record<string, string>>;

const defs = MCP_TOOL_DEFS.filter((def) => def.provider === "grafana-stack");
const ctx = sampleCtx["grafana-stack"] ?? {};

/** Two markers, so a repeated key and a joined value are distinguishable. */
const SENTINELS = ["wm-a", "wm-b"] as const;

interface Built {
  readonly method: string;
  readonly url: URL;
}

function build(slug: string, args: Record<string, unknown>): Built {
  const def = defs.find((entry) => entry.toolSlug === slug);
  assert.ok(def, `${slug} must be a grafana-stack tool`);
  const request = def.build({ args, ctx });
  return { method: request.method, url: new URL(request.url) };
}

/** `/dashboards/uid/{uid}` -> an anchored regex, as the generator does. */
function templateToRegex(template: string): RegExp {
  const body = template
    .split("/")
    .map((segment) =>
      /^\{[^}]+\}$/.test(segment)
        ? "[^/]+"
        : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("/");
  return new RegExp(`^/api${body}$`);
}

/** Every property of the catalog schema, with the array ones actually filled. */
function argsWithSentinels(slug: string): Record<string, unknown> {
  const args: Record<string, unknown> = { ...(sampleArgs[slug] ?? {}) };
  for (const [key, value] of Object.entries(args)) {
    if (Array.isArray(value)) args[key] = [...SENTINELS];
  }
  return args;
}

function declaredQueryOf(operation: Operation): Map<string, Parameter> {
  return new Map(
    operation.parameters
      .filter((parameter) => parameter.in === "query")
      .map((parameter) => [parameter.name, parameter]),
  );
}

/** `dashboard_uid` and `dashboardUID` are the same argument spelled two ways. */
function normalize(name: string): string {
  return name.replace(/_/g, "").toLowerCase();
}

describe("grafana-stack builders against the Grafana HTTP API", () => {
  it("records an operation for every Grafana stack tool", () => {
    assert.equal(defs.length, 15, "the Grafana stack registers fifteen tools");
    for (const def of defs) {
      assert.ok(
        params.tools[def.toolSlug],
        `${def.toolSlug}: missing from grafana-stack-params.json (regenerate it)`,
      );
    }
    assert.equal(
      Object.keys(params.tools).length,
      defs.length,
      "the fixture has an entry the catalog does not use",
    );
  });

  for (const def of defs) {
    it(`${def.toolSlug} calls the declared operation with declared parameters`, () => {
      const operation = params.tools[def.toolSlug]!;
      // Sentinel-filled args, not the plain sample args: an empty array is
      // dropped by the query builder, so a misspelled array parameter would
      // never reach the URL and the check below could not see it.
      const { method, url } = build(def.toolSlug, argsWithSentinels(def.toolSlug));

      assert.equal(
        method,
        operation.method,
        `${def.toolSlug}: ${operation.operationId} is ${operation.method}`,
      );
      assert.equal(
        url.host,
        "acme.grafana.net",
        `${def.toolSlug}: the builder must target the stack host from the context`,
      );
      assert.match(
        url.pathname,
        templateToRegex(operation.path),
        `${def.toolSlug}: ${url.pathname} is not ${operation.method} /api${operation.path}`,
      );
      assert.ok(
        !url.pathname.includes("{") && !url.pathname.includes("}"),
        `${def.toolSlug}: a path parameter was left unsubstituted in ${url.pathname}`,
      );

      const declaredQuery = declaredQueryOf(operation);

      // The anti-invention check: a key the API does not declare is silently
      // ignored by Grafana, so only the spec can catch it.
      const unknown = [...new Set(url.searchParams.keys())].filter(
        (key) => !declaredQuery.has(key),
      );
      assert.deepEqual(
        unknown,
        [],
        `${def.toolSlug}: these query parameters are not in ${operation.operationId}: ${unknown.join(", ")}`,
      );

      for (const [key, value] of url.searchParams) {
        const declared = declaredQuery.get(key);
        if (declared?.enum) {
          assert.ok(
            declared.enum.includes(value),
            `${def.toolSlug}: ${key}=${value} is not one of ${declared.enum.join(", ")}`,
          );
        }
      }
    });

    it(`${def.toolSlug} leaves no declared argument unused`, () => {
      const operation = params.tools[def.toolSlug]!;
      const { url } = build(def.toolSlug, argsWithSentinels(def.toolSlug));
      const emitted = new Set([
        ...[...url.searchParams.keys()].map(normalize),
        ...operation.parameters
          .filter((parameter) => parameter.in === "path")
          .map((parameter) => normalize(parameter.name)),
      ]);

      // The sample args carry one entry per property of the catalog schema, so
      // they are the schema's own property list without reaching across packages.
      const properties = Object.keys(sampleArgs[def.toolSlug] ?? {});
      const dead = properties.filter((property) => !emitted.has(normalize(property)));
      assert.deepEqual(
        dead,
        [],
        `${def.toolSlug}: these arguments never reach the request: ${dead.join(", ")}`,
      );
    });
  }

  it("repeats a multi collection and joins a csv one", () => {
    let checked = 0;
    for (const def of defs) {
      const operation = params.tools[def.toolSlug]!;
      const declaredQuery = declaredQueryOf(operation);
      const { url } = build(def.toolSlug, argsWithSentinels(def.toolSlug));

      for (const key of new Set(url.searchParams.keys())) {
        const declared = declaredQuery.get(key);
        if (declared?.type !== "array") continue;
        const values = url.searchParams.getAll(key);
        if (declared.collectionFormat === "multi") {
          assert.deepEqual(
            values,
            [...SENTINELS],
            `${def.toolSlug}: ${key} is a multi collection and must repeat the key (got ${values.join(" | ")})`,
          );
        } else {
          assert.deepEqual(
            values,
            [SENTINELS.join(",")],
            `${def.toolSlug}: ${key} is a csv collection and must be sent once, comma-joined`,
          );
        }
        checked += 1;
      }
    }
    assert.ok(
      checked >= 3,
      `expected to check several array parameters, checked ${checked}`,
    );
  });
});
