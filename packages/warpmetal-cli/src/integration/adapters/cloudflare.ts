import { knownFlags, parseArgs, requireConfirm, requireFlag, type ParsedArgs } from "../../args.js";
import { CliError } from "../../errors.js";
import type { Redactor } from "../../output.js";
import { findProvider } from "../registry.js";
import {
  failure,
  needsAuth,
  ok,
  type Adapter,
  type AdapterContext,
  type AdapterResult,
} from "./types.js";

const TOKEN_SECRET = "cloudflare.token";
const API = "https://api.cloudflare.com/client/v4";

/**
 * Cloudflare DNS.
 *
 * Scope in this release is deliberately narrow: list and upsert a DNS record.
 * The zone id and the account reference come from the client manifest, never
 * from a guess, and the token is read from the store one name at a time so it
 * cannot be echoed into a plan or a log.
 */
export const cloudflareAdapter: Adapter = {
  spec: findProvider("cloudflare")!,

  gates: {
    "dns-upsert": "CONFIRM DNS CHANGE",
  },

  async status(context: AdapterContext): Promise<AdapterResult> {
    const token = await context.store.read(TOKEN_SECRET);
    if (token === null) {
      return needsAuth("cloudflare", "status", `No ${TOKEN_SECRET} in the store. Run \`warpmetal env store set ${TOKEN_SECRET}\`.`);
    }
    context.redactor.add(token);

    const response = await context.http({
      method: "GET",
      url: `${API}/user/tokens/verify`,
      headers: { authorization: `Bearer ${token}` },
    });

    if (response.status === 0) {
      return { provider: "cloudflare", verb: "status", status: "DEGRADED", warnings: ["Cloudflare API unreachable; token validity is unknown."] };
    }
    if (response.status === 401 || response.status === 403) {
      return { provider: "cloudflare", verb: "status", status: "NEEDS_AUTH", warnings: ["Cloudflare rejected the stored token."] };
    }
    if (!response.ok) {
      return failure("cloudflare", "status", `Cloudflare responded with HTTP ${response.status}.`);
    }

    // Only assert what the verify endpoint actually returned.
    const body = response.json as { result?: { status?: string } } | null;
    const tokenStatus = body?.result?.status ?? "unknown";
    return {
      provider: "cloudflare",
      verb: "status",
      status: tokenStatus === "active" ? "OK" : "NEEDS_AUTH",
      mode: "api_token",
      data: { tokenStatus, capabilities: this.spec.capabilities },
      warnings: ["Token scope is not introspectable here; only validity is reported."],
    };
  },

  async run(verb: string, args: ParsedArgs, context: AdapterContext): Promise<AdapterResult> {
    // Verb validation happens before any credential is read: an unknown verb is
    // a usage error, never `NEEDS_AUTH`. Reporting "you are missing a token" for
    // a typo would send the operator down the wrong path.
    if (verb !== "dns-list" && verb !== "dns-upsert") {
      throw new CliError("usage_error", `Unknown cloudflare verb: ${verb}. Try: status, dns-list, dns-upsert.`);
    }

    // Flags, required values and the confirmation gate are all checked before the
    // store is read, for the same reason as the verb check above: `usage_error`
    // and `NEEDS_AUTH` are different diagnoses, and an operator who forgot
    // `--confirm` must be told that rather than sent to store a token that would
    // not have made the invocation valid. It also means a gate-less call never
    // reaches the credential store at all.
    const plan = planDnsVerb(verb, args, this.gates["dns-upsert"]!);

    const token = await context.store.read(TOKEN_SECRET);
    if (token === null) {
      return needsAuth("cloudflare", verb, `No ${TOKEN_SECRET} in the store.`);
    }
    context.redactor.add(token);
    const headers = { authorization: `Bearer ${token}` };

    if (plan.kind === "dns-list") {
      const response = await context.http({
        method: "GET",
        url: `${API}/zones/${encodeURIComponent(plan.zoneId)}/dns_records${plan.query}`,
        headers,
      });
      return readRecords(response, verb);
    }

    const existing = await context.http({
      method: "GET",
      url: `${API}/zones/${encodeURIComponent(plan.zoneId)}/dns_records?type=${encodeURIComponent(plan.recordType)}&name=${encodeURIComponent(plan.name)}`,
      headers,
    });
    if (existing.status === 0) {
      return failure("cloudflare", verb, "Cloudflare API unreachable; no record was changed.");
    }
    if (!existing.ok) {
      return failure("cloudflare", verb, `Could not read existing records (HTTP ${existing.status}).`);
    }
    const found = (existing.json as { result?: Array<{ id?: string; content?: string }> } | null)?.result ?? [];
    const current = found[0];

    const payload = { type: plan.recordType, name: plan.name, content: plan.content, ttl: plan.ttl };

    // Idempotence: an identical record is reported, not rewritten. Re-running
    // a deploy must not bump anything upstream.
    if (current?.id !== undefined && current.content === plan.content) {
      return {
        provider: "cloudflare",
        verb,
        status: "OK",
        data: { action: "unchanged", recordId: current.id, name: plan.name, type: plan.recordType },
      };
    }

    const write = current?.id !== undefined
      ? await context.http({ method: "PUT", url: `${API}/zones/${encodeURIComponent(plan.zoneId)}/dns_records/${encodeURIComponent(current.id)}`, headers, body: payload })
      : await context.http({ method: "POST", url: `${API}/zones/${encodeURIComponent(plan.zoneId)}/dns_records`, headers, body: payload });

    if (!write.ok) {
      return failure("cloudflare", verb, `Cloudflare rejected the write (HTTP ${write.status}).`);
    }
    const record = (write.json as { result?: { id?: string } } | null)?.result ?? {};
    return {
      provider: "cloudflare",
      verb,
      status: "OK",
      data: { action: current?.id !== undefined ? "updated" : "created", recordId: record.id ?? null, name: plan.name, type: plan.recordType },
    };
  },
};

interface DnsListPlan {
  readonly kind: "dns-list";
  readonly zoneId: string;
  /** Query string including the leading `?`, or empty. */
  readonly query: string;
}

interface DnsUpsertPlan {
  readonly kind: "dns-upsert";
  readonly zoneId: string;
  readonly name: string;
  readonly recordType: string;
  readonly content: string;
  readonly ttl: number;
}

type DnsVerbPlan = DnsListPlan | DnsUpsertPlan;

/**
 * Validates one DNS verb and returns everything the request needs.
 *
 * Pure: it reads no credential and performs no I/O, so the caller can run it
 * first and be sure that anything it lets through was well formed.
 */
function planDnsVerb(verb: string, args: ParsedArgs, upsertGate: string): DnsVerbPlan {
  if (verb === "dns-list") {
    knownFlags(args, ["zone-id", "type", "name", "json"]);
    const zoneId = requireFlag(args, "zone-id");
    const query = new URLSearchParams();
    const type = args.flags.get("type");
    const name = args.flags.get("name");
    if (typeof type === "string") query.set("type", type);
    if (typeof name === "string") query.set("name", name);
    return { kind: "dns-list", zoneId, query: query.size > 0 ? `?${query.toString()}` : "" };
  }

  knownFlags(args, ["zone-id", "name", "type", "content", "ttl", "proxied", "confirm", "json"]);
  requireConfirm(args, upsertGate);
  const zoneId = requireFlag(args, "zone-id");
  const name = requireFlag(args, "name");
  const recordType = requireFlag(args, "type");
  const content = requireFlag(args, "content");
  const ttlRaw = args.flags.get("ttl");
  const ttl = typeof ttlRaw === "string" ? Number.parseInt(ttlRaw, 10) : 1;
  if (!Number.isFinite(ttl) || ttl < 1) {
    throw new CliError("usage_error", "--ttl must be a positive integer.");
  }
  return { kind: "dns-upsert", zoneId, name, recordType, content, ttl };
}

function readRecords(response: { status: number; ok: boolean; json: unknown }, verb: string): AdapterResult {
  if (response.status === 0) return failure("cloudflare", verb, "Cloudflare API unreachable.");
  if (!response.ok) return failure("cloudflare", verb, `Cloudflare responded with HTTP ${response.status}.`);
  const records = ((response.json as { result?: Array<{ id?: string; name?: string; type?: string; content?: string }> } | null)?.result ?? []).map(
    (record) => ({ id: record.id ?? null, name: record.name ?? null, type: record.type ?? null, content: record.content ?? null }),
  );
  return ok("cloudflare", verb, { count: records.length, records });
}

/** Exposed so `env plan` can preview the upsert without a network call. */
export function cloudflareUpsertPlan(args: readonly string[]): Record<string, unknown> {
  const parsed = parseArgs(args);
  return {
    provider: "cloudflare",
    verb: "dns-upsert",
    zoneId: parsed.flags.get("zone-id") ?? null,
    name: parsed.flags.get("name") ?? null,
    type: parsed.flags.get("type") ?? null,
    // The content is a public IP, not a secret, so it is safe to preview.
    content: parsed.flags.get("content") ?? null,
    gate: cloudflareAdapter.gates["dns-upsert"],
  };
}

/** Keeps the redactor honest when a provider echoes a token back. */
export function registerCloudflareSecrets(redactor: Redactor, token: string | null): void {
  redactor.add(token);
}
