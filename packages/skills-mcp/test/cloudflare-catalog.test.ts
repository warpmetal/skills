/**
 * cloudflare-catalog.test.ts - the reviewed invariants of the Cloudflare wave,
 * asserted on the catalog itself rather than on a live call.
 *
 * The CLI's suites prove the builder calls the documented route. This one covers
 * what the catalog promises before a request exists: that every description
 * names the endpoint and the token permission, that the annotations agree with
 * the HTTP method the operation uses, that every write is gated and every read
 * is not, and that the destructive set is exactly the reviewed one.
 *
 * The endpoint each tool calls is owned by the CLI's distilled-spec fixture, so
 * this test reads it rather than restating it in two places.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  DESTRUCTIVE_SLUGS,
  EXPERIMENTAL_SLUGS,
  findProviderToolMapping,
  loadProviderCatalog,
} from "../src/providers/index.js";

interface Operation {
  readonly toolSlug: string;
  readonly method: string;
  readonly path: string;
  readonly auth: string;
  readonly destructive: boolean;
  readonly bodyKind: string;
  readonly pathParams: readonly { readonly name: string; readonly arg: string }[];
  readonly tokenGroups: readonly string[];
}

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "../../warpmetal-cli/test/fixtures/cloudflare-params.json"), "utf8"),
) as { readonly tools: Record<string, Operation> };

const tools = loadProviderCatalog().filter((tool) => tool.toolkitId === "cloudflare");
const operations = Object.values(fixture.tools);

/** The reviewed destructive set for this wave, spelled out on purpose. */
const REVIEWED_DESTRUCTIVE = [
  "cloudflare_d1_database_database_id_query",
  "cloudflare_d1_database_database_id_raw_create",
  "cloudflare_d1_database_database_id_time_travel_restore",
  "cloudflare_d1_database_delete",
  "cloudflare_dns_records_batch",
  "cloudflare_dns_records_delete",
  "cloudflare_dnssec_delete",
  "cloudflare_hyperdrive_configs_delete",
  "cloudflare_pages_projects_delete",
  "cloudflare_pages_projects_project_name_purge_build_cache",
  "cloudflare_purge_cache",
  "cloudflare_queues_delete",
  "cloudflare_queues_queue_id_messages_purge",
  "cloudflare_queues_queue_id_purge",
  "cloudflare_r2_buckets_bucket_name_objects_delete",
  "cloudflare_r2_buckets_bucket_name_objects_delete_bulk",
  "cloudflare_r2_buckets_delete",
  "cloudflare_r2_catalog_bucket_name_delete_create",
  "cloudflare_storage_kv_namespaces_delete",
  "cloudflare_storage_kv_namespaces_namespace_id_bulk_delete_create",
  "cloudflare_storage_kv_namespaces_namespace_id_bulk_put",
  "cloudflare_storage_kv_namespaces_namespace_id_values_delete",
  "cloudflare_vectorize_v2_indexes_delete",
  "cloudflare_vectorize_v2_indexes_index_name_delete_by_ids_create",
  "cloudflare_vectorize_v2_indexes_index_name_metadata_index_delete_create",
  "cloudflare_workers_dispatch_namespaces_delete",
  "cloudflare_workers_dispatch_namespaces_dispatch_namespace_scripts_delete",
  "cloudflare_workers_dispatch_namespaces_dispatch_namespace_scripts_delete_all",
  "cloudflare_workers_scripts_delete",
  "cloudflare_workers_workers_delete",
  "cloudflare_workers_workers_worker_id_previews_delete",
  "cloudflare_workers_workers_worker_id_previews_preview_id_deployments_delete",
  "cloudflare_workers_workers_worker_id_versions_delete",
  "cloudflare_workflows_delete",
  "cloudflare_workflows_workflow_name_instances_delete",
  "cloudflare_zones_delete",
] as const;

test("the cloudflare wave ships the operations it says it does", () => {
  assert.ok(tools.length >= 300, `expected a substantial wave, found ${tools.length}`);
  assert.equal(tools.length, operations.length);

  const slugs = new Set(tools.map((tool) => tool.toolSlug));
  for (const slug of [
    "cloudflare_zones_list",
    "cloudflare_zones_create",
    "cloudflare_zones_get",
    "cloudflare_zones_update",
    "cloudflare_zones_delete",
    "cloudflare_dns_records_list",
    "cloudflare_dns_records_create",
    "cloudflare_dns_records_get",
    "cloudflare_dns_records_update",
    "cloudflare_dns_records_replace",
    "cloudflare_dns_records_delete",
    "cloudflare_dns_records_batch",
    "cloudflare_dns_settings_list",
    "cloudflare_dnssec_list",
    "cloudflare_settings_list",
    "cloudflare_settings_get",
    "cloudflare_settings_update",
    "cloudflare_purge_cache",
    "cloudflare_firewall_access_rules_rules_create",
    "cloudflare_firewall_lockdowns_create",
    "cloudflare_firewall_ua_rules_create",
    "cloudflare_accounts_list",
    "cloudflare_user_tokens_verify",
  ]) {
    assert.ok(slugs.has(slug), `the wave is missing ${slug}`);
  }

  // The two slugs that predate the naming rule: one renamed, one reused.
  assert.ok(!slugs.has("cloudflare_accounts_list_accounts"), "the old accounts slug is gone");
});

test("every description names the endpoint and the permission it needs", () => {
  for (const tool of tools) {
    const operation = fixture.tools[tool.toolSlug];
    assert.ok(operation, `${tool.toolSlug}: not in the distilled spec`);
    assert.ok(
      tool.description.includes(`${operation.method} ${operation.path}.`),
      `${tool.toolSlug}: the description must name ${operation.method} ${operation.path}`,
    );
    if (operation.auth === "none") {
      assert.match(tool.description, /needs no credential/);
    } else if (operation.tokenGroups.length > 0) {
      assert.match(
        tool.description,
        /Requires (a token with the .+ permission|any one of a long list of token permissions)/,
        `${tool.toolSlug}: the description must say which token permission it needs`,
      );
    }
    assert.ok(
      tool.description.length > 10,
      `${tool.toolSlug}: the repo-wide rule is a description longer than 10 characters`,
    );
    assert.notEqual(
      tool.description.trim(),
      `${operation.method} ${operation.path}.`,
      `${tool.toolSlug}: the description must say more than the endpoint`,
    );
  }
});

test("the annotations agree with the HTTP method the operation uses", () => {
  for (const tool of tools) {
    const operation = fixture.tools[tool.toolSlug]!;
    const readOnly = tool.annotations.readOnlyHint === true;
    assert.equal(readOnly, operation.method === "GET", `${tool.toolSlug}: readOnlyHint`);
    assert.equal(
      tool.annotations.idempotentHint,
      ["GET", "PUT", "DELETE"].includes(operation.method),
      `${tool.toolSlug}: idempotentHint`,
    );
    assert.equal(tool.annotations.openWorldHint, true, `${tool.toolSlug}: openWorldHint`);
    assert.equal(
      tool.annotations.destructiveHint,
      operation.destructive,
      `${tool.toolSlug}: destructiveHint must match the reviewed allowlist decision`,
    );
    // The repo-wide invariant: the registered hint equals membership in the
    // curated set, which is what `providers.test.ts` also asserts.
    assert.equal(
      tool.annotations.destructiveHint === true,
      DESTRUCTIVE_SLUGS.has(tool.toolSlug),
      `${tool.toolSlug}: destructiveHint and DESTRUCTIVE_SLUGS disagree`,
    );
    if (tool.annotations.destructiveHint === true) {
      assert.equal(readOnly, false, `${tool.toolSlug}: a destructive tool cannot be read-only`);
    }
  }
  assert.deepEqual(
    [...DESTRUCTIVE_SLUGS].filter((slug) => operations.some((op) => op.toolSlug === slug)).sort(),
    [...REVIEWED_DESTRUCTIVE],
    "the cloudflare half of the destructive set is a reviewed decision",
  );
});

test("every write is gated and every read is not", () => {
  for (const tool of tools) {
    const operation = fixture.tools[tool.toolSlug]!;
    const mapping = findProviderToolMapping(tool.toolSlug);
    assert.ok(mapping, `${tool.toolSlug}: no provider mapping`);
    assert.equal(mapping.provider, "cloudflare");
    assert.equal(
      mapping.mutating,
      operation.method !== "GET",
      `${tool.toolSlug}: mutating must follow the method`,
    );
    if (operation.method === "GET") {
      assert.equal(mapping.gate, undefined, `${tool.toolSlug}: a read must not be gated`);
    } else {
      assert.equal(
        mapping.gate,
        `CONFIRM CLOUDFLARE ${mapping.verb.toUpperCase().replace(/-/g, " ")}`,
        `${tool.toolSlug}: a write must carry the provider's confirm gate`,
      );
    }
  }
});

test("the schema is strict, snake_case, and requires every path parameter", () => {
  for (const tool of tools) {
    const operation = fixture.tools[tool.toolSlug]!;
    const schema = tool.inputSchema;
    assert.equal(schema.type, "object", `${tool.toolSlug}: the root must be an object`);
    assert.equal(
      schema.additionalProperties,
      operation.bodyKind === "free-form",
      `${tool.toolSlug}: only an operation whose body the spec does not publish may take an undeclared argument`,
    );
    const required = new Set(schema.required ?? []);
    for (const parameter of operation.pathParams) {
      assert.ok(
        required.has(parameter.arg),
        `${tool.toolSlug}: the path parameter ${parameter.arg} must be required`,
      );
    }
    for (const [name, property] of Object.entries(schema.properties ?? {})) {
      assert.match(name, /^[a-z0-9]+(_[a-z0-9]+)*$/, `${tool.toolSlug}: ${name} is not snake_case`);
      assert.ok(property.description, `${tool.toolSlug}: ${name} has no description`);
      // A property either declares its type, or says in words that the API
      // accepts any JSON value for it (a zone setting's `value` is typed per
      // setting, and the spec declares nothing).
      assert.ok(
        property.type !== undefined ||
          property.anyOf !== undefined ||
          String(property.description).includes("any JSON value"),
        `${tool.toolSlug}: ${name} declares no type and does not say it is free-form`,
      );
    }
  }
});

test("no cloudflare tool is marked experimental", () => {
  // The marker is for a request shape that could not be confirmed; every
  // Cloudflare builder here is checked against the published spec offline.
  const marked = [...EXPERIMENTAL_SLUGS].filter((slug) => slug.startsWith("cloudflare_"));
  assert.deepEqual(marked, [], "a cloudflare tool was added to EXPERIMENTAL_SLUGS");
});
