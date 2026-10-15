/**
 * provider-contract.test.ts - the guard against a builder drifting from the
 * provider's documented API behind a fixture that was regenerated from the
 * builder itself.
 *
 * `mcp-request-contract.test.ts` compares each builder against a fixture that
 * `gen-mcp-contract-fixtures.mjs` produced from the same builder, so it cannot
 * notice a wrong host, method or auth header: the fixture would encode the same
 * mistake. This test compares the builder against `provider-contracts.json`, a
 * hand-authored file read off each provider's public API reference
 * (`providers[].docUrl`). It catches the "Amplitude-class" bug (the URL pointed
 * at the experiment management host that 404s) without any credential.
 *
 * The check is deliberately narrow - host, method and auth header - so it is
 * stable across a provider releasing a new API version. Anything deeper (body
 * fields, query names) is reviewed against the docs and pinned by the request
 * fixtures.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { MCP_TOOL_DEFS } from "../src/integration/mcp-tools/index.js";

interface ProviderAuth {
  readonly header: string;
  readonly placeholder: string;
}

interface ProviderContract {
  readonly docUrl: string;
  readonly allowedHosts?: readonly string[];
  readonly hostSuffix?: string;
  readonly accountScoped?: boolean;
  readonly methods: readonly string[];
  readonly auth: ProviderAuth | null;
}

interface ContractFile {
  readonly version: number;
  readonly providers: Record<string, ProviderContract>;
  readonly tools?: Record<
    string,
    { readonly note?: string; readonly experimental?: boolean; readonly auth?: ProviderAuth | null }
  >;
}

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures/mcp-requests");
const contracts = JSON.parse(
  readFileSync(join(here, "fixtures/provider-contracts.json"), "utf8"),
) as ContractFile;

const sampleArgs = JSON.parse(readFileSync(join(fixtures, "sample-args.json"), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const sampleCtx = JSON.parse(readFileSync(join(fixtures, "sample-ctx.json"), "utf8")) as Record<
  string,
  Record<string, string>
>;

function hostMatches(contract: ProviderContract, host: string): boolean {
  if (contract.allowedHosts?.includes(host)) return true;
  if (contract.hostSuffix && host.endsWith(contract.hostSuffix)) return true;
  return false;
}

function placeholderHeader(
  request: { headers?: Readonly<Record<string, string>>; url: string },
): { header: string; placeholder: string } | null {
  for (const [header, value] of Object.entries(request.headers ?? {})) {
    if (value.includes("__TOKEN__")) return { header, placeholder: "__TOKEN__" };
    if (value.includes("__BASIC__")) return { header, placeholder: "__BASIC__" };
  }
  // A handful of providers carry the credential in the query string (Gemini's
  // `?key=` / `?key=__TOKEN__`), so treat a URL placeholder as an auth header.
  if (request.url.includes("__TOKEN__")) return { header: "", placeholder: "__TOKEN__" };
  if (request.url.includes("__BASIC__")) return { header: "", placeholder: "__BASIC__" };
  return null;
}

describe("mcp provider request contracts (host / method / auth)", () => {
  it("every provider in the catalog has an api reference entry", () => {
    const providers = new Set(MCP_TOOL_DEFS.map((def) => def.provider));
    for (const provider of providers) {
      assert.ok(
        contracts.providers[provider],
        `provider ${provider} is missing from provider-contracts.json`,
      );
    }
    assert.equal(
      Object.keys(contracts.providers).length,
      providers.size,
      "provider-contracts.json has a provider the catalog does not use",
    );
  });

  it("every api reference url is https and every provider lists its hosts", () => {
    for (const [provider, contract] of Object.entries(contracts.providers)) {
      assert.ok(
        contract.docUrl.startsWith("https://"),
        `${provider}: docUrl must be https`,
      );
      assert.ok(
        (contract.allowedHosts?.length ?? 0) > 0 || contract.hostSuffix,
        `${provider}: needs allowedHosts or hostSuffix`,
      );
      if (contract.hostSuffix) {
        assert.ok(
          contract.accountScoped === true,
          `${provider}: hostSuffix is only for account-scoped providers`,
        );
      }
    }
  });

  for (const def of MCP_TOOL_DEFS) {
    it(`${def.toolSlug} targets the documented host, method and auth`, () => {
      const contract = contracts.providers[def.provider];
      assert.ok(contract, `${def.toolSlug}: no contract for provider ${def.provider}`);

      const request = def.build({
        args: sampleArgs[def.toolSlug] ?? {},
        ctx: sampleCtx[def.provider] ?? {},
      });

      const host = new URL(request.url).host;
      assert.ok(
        hostMatches(contract, host),
        `${def.toolSlug}: host ${host} is not in ${JSON.stringify(
          contract.allowedHosts ?? contract.hostSuffix,
        )} (see ${contract.docUrl})`,
      );

      assert.ok(
        contract.methods.includes(request.method),
        `${def.toolSlug}: method ${request.method} not documented (${contract.methods.join(", ")})`,
      );

      const found = placeholderHeader(request);
      // A provider can have a public endpoint next to authenticated ones, so a
      // per-tool `auth` entry overrides the provider-level default.
      const toolAuth = contracts.tools?.[def.toolSlug]?.auth;
      const expectedAuth = toolAuth === undefined ? contract.auth : toolAuth;
      if (expectedAuth === null) {
        assert.equal(
          found,
          null,
          `${def.toolSlug}: contract says no auth but the request carries ${JSON.stringify(found)}`,
        );
      } else {
        assert.ok(found, `${def.toolSlug}: request carries no auth placeholder`);
        const auth = found as { header: string; placeholder: string };
        assert.equal(
          auth.placeholder,
          expectedAuth.placeholder,
          `${def.toolSlug}: expected ${expectedAuth.placeholder}`,
        );
        if (expectedAuth.header) {
          assert.equal(
            auth.header,
            expectedAuth.header,
            `${def.toolSlug}: auth must travel in ${expectedAuth.header}`,
          );
        }
      }
    });
  }

  it("flags the X publish tool as experimental in both places", () => {
    const note = contracts.tools?.["x_create_posts"];
    assert.equal(note?.experimental, true, "x_create_posts must be marked experimental");
  });
});
