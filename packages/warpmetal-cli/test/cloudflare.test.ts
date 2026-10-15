/**
 * cloudflare.test.ts - the parts of the Cloudflare surface that no fixture can
 * pin: the argument checks the JSON Schema cannot express, the percent-encoding
 * of a path parameter, and the fact that a PATCH sends only what it was given.
 *
 * `cloudflare-params.test.ts` proves each builder calls the documented route;
 * `mcp-request-contract` proves the payload did not drift. This file covers the
 * behaviour between those two: what happens to the arguments before a request
 * exists at all.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MCP_TOOL_DEFS, findMcpTool } from "../src/integration/mcp-tools/index.js";
import type { McpToolRequest } from "../src/integration/mcp-tools/types.js";

const ctx: Record<string, string> = {};

function tool(verb: string) {
  const def = findMcpTool("cloudflare", verb);
  assert.ok(def, `cloudflare:${verb} must exist`);
  return def;
}

function build(verb: string, args: Record<string, unknown>): McpToolRequest {
  return tool(verb).build({ args, ctx });
}

/** The request as it would travel: `undefined` fields are dropped by JSON. */
function wire(request: McpToolRequest): McpToolRequest {
  return JSON.parse(JSON.stringify(request)) as McpToolRequest;
}

describe("cloudflare argument checks the schema cannot express", () => {
  it("refuses a record without a name, a type or a value", () => {
    const create = tool("dns-records-create");
    assert.ok(create.validate, "the create tool must carry a validator");

    assert.match(String(create.validate({ zone_id: "z" })), /Provide type, name/);
    assert.match(
      String(create.validate({ zone_id: "z", type: "A", name: "www" })),
      /content or data/,
    );
    assert.equal(
      create.validate({ zone_id: "z", type: "A", name: "www", content: "203.0.113.1" }),
      null,
    );
    // An SRV record carries its value in `data` instead of `content`.
    assert.equal(
      create.validate({ zone_id: "z", type: "SRV", name: "_sip._tcp", data: { target: "sip" } }),
      null,
    );
  });

  it("refuses a PUT that would clear the record it replaces", () => {
    const replace = tool("dns-records-replace");
    assert.ok(replace.validate, "the replace tool must carry a validator");
    assert.match(
      String(replace.validate({ zone_id: "z", dns_record_id: "r", type: "A" })),
      /content or data/,
    );
    assert.equal(
      replace.validate({ zone_id: "z", dns_record_id: "r", type: "A", name: "www", content: "1.2.3.4" }),
      null,
    );
  });

  it("refuses an empty batch", () => {
    const batch = tool("dns-records-batch");
    assert.ok(batch.validate, "the batch tool must carry a validator");
    assert.match(String(batch.validate({ zone_id: "z" })), /at least one of posts/);
    assert.match(String(batch.validate({ zone_id: "z", deletes: [] })), /at least one of posts/);
    assert.equal(batch.validate({ zone_id: "z", deletes: [{ id: "r1" }] }), null);
  });

  it("only the three tools that need a check carry one", () => {
    const withValidator = MCP_TOOL_DEFS.filter(
      (def) => def.provider === "cloudflare" && def.validate,
    ).map((def) => def.toolSlug);
    assert.deepEqual(withValidator.sort(), [
      "cloudflare_dns_records_batch",
      "cloudflare_dns_records_create",
      "cloudflare_dns_records_replace",
    ]);
  });
});

describe("cloudflare request shape", () => {
  it("percent-encodes a path parameter", () => {
    // A record name or an object key can carry a slash, which would otherwise
    // build a different route rather than a bad argument.
    const request = build("dns-records-get", {
      zone_id: "zone 1",
      dns_record_id: "a/b",
    });
    assert.ok(
      request.url.includes("/zones/zone%201/dns_records/a%2Fb"),
      `expected the encoded path, got ${request.url}`,
    );
  });

  it("sends only the fields a PATCH was given", () => {
    const request = wire(
      build("dns-records-update", {
        zone_id: "z",
        dns_record_id: "r",
        content: "203.0.113.1",
      }),
    );
    assert.deepEqual(request.body, { content: "203.0.113.1" });
  });

  it("sends every declared body field a create was given", () => {
    const request = wire(
      build("dns-records-create", {
        zone_id: "z",
        type: "A",
        name: "www",
        content: "203.0.113.1",
        proxied: false,
        tags: [],
      }),
    );
    assert.deepEqual(request.body, {
      type: "A",
      name: "www",
      content: "203.0.113.1",
      // `false` and an empty array are values, not absences: dropping them would
      // create a proxied record with no change to its DNS-only intent.
      proxied: false,
      tags: [],
    });
  });

  it("keeps the API's own query names while the schema stays snake_case", () => {
    const request = build("dns-records-list", {
      zone_id: "z",
      name_exact: "www.example.com",
      "per_page": 5,
    });
    const url = new URL(request.url);
    assert.equal(url.searchParams.get("name.exact"), "www.example.com");
    assert.equal(url.searchParams.get("per_page"), "5");
    // The declared argument is named `name_exact`; only the wire name is dotted.
    assert.equal(url.searchParams.get("name_exact"), null);
  });

  it("carries the API token in the Authorization header", () => {
    assert.equal(
      build("zones-list", {}).headers?.Authorization,
      "Bearer __TOKEN__",
    );
    assert.equal(
      build("zones-create", { account: { id: "a" }, name: "example.com" }).headers?.[
        "Content-Type"
      ],
      "application/json",
    );
  });
});
