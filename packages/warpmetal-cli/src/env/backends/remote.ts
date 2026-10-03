/**
 * The remote credential backend: the server is the vault.
 *
 * Everything the local backends do locally - counting generations, enforcing a
 * compare-and-set precondition, deciding whether a name exists - is decided by
 * the server here, and this class is the thin, honest client of that decision.
 * Three properties follow from that and are non-negotiable:
 *
 *  1. **Per-key, never whole-vault.** There is no `load()`/`save()` pair to lift
 *     onto this contract: a write sends the one value it was given, and a
 *     `has()` is answered from the list metadata. A remote backend that fetched
 *     every secret to write one would turn every `env store set` into a
 *     disclosure of the whole vault.
 *
 *  2. **Fail closed.** No session means `NEEDS_AUTH` (exit 4) on every
 *     operation. There is no fallback to the file backend: silently degrading a
 *     server-authoritative vault to a local file would put a credential
 *     somewhere the operator did not choose, and hide a rejected session.
 *
 *  3. **No caching.** The previous generation of the local store memoized the
 *     decrypted payload for the process lifetime. A remote vault makes that
 *     untenable: another client's write must be visible immediately and must be
 *     able to invalidate our next write. `generation` is therefore the version
 *     the *server* reports, not a counter this process remembers.
 *
 * ## Wire contract
 *
 * `WARPMETAL_VAULT_URL` points at the customer-facing endpoint that fronts
 * `warpmetal-identity`'s `/internal/customer/cli/credentials*` routes. That
 * endpoint is reached with the customer CLI device session, which Identity
 * reads from `X-Warpmetal-Customer-Authorization` - the same header the
 * internal route takes, so a transparent forwarder needs no translation. The
 * `Authorization` service token and the client-certificate fingerprint belong
 * to the proxy that terminates mTLS and are never sent from here.
 *
 *   GET    {base}               -> 200 {"credentials": [{name, provider, keyVersion, createdAt, updatedAt}]}
 *   GET    {base}/{name}        -> 200 {"name": n, "value": v} | 404
 *   POST   {base}               -> 201 {"name": n, ...} | 409 when the name already exists
 *   POST   {base}/{name}:rotate -> 200 {"name": n, ...} | 404
 *   DELETE {base}/{name}        -> 200 {"status": "revoked"} | 404
 *
 * `version` is the server-imposed vault version, when a server offers one. The
 * Identity surface does not: it reports per-slot `keyVersion` and `updatedAt`
 * instead, so this client derives a stable digest of that metadata - it still
 * changes whenever the server state changes, which is all a precondition needs.
 */
import { CliError } from "../../errors.js";
import type { HttpFn, HttpRequest, HttpResponse } from "../../integration/http.js";
import type { EnvPaths } from "../paths.js";
import { StaleWriteError, type BackendInfo, type SecretBackend } from "./types.js";

/** Presence of this variable switches the store to the remote backend. */
export const VAULT_URL_ENV = "WARPMETAL_VAULT_URL";
/** Short-lived session token, for CI and scripted runs. Takes precedence. */
export const VAULT_TOKEN_ENV = "WARPMETAL_VAULT_TOKEN";
/**
 * The customer CLI device session, exactly as Identity reads it.
 *
 * The name is Identity's own: sending the session under `Authorization` would
 * be a second, invented spelling of the same contract, and the proxy would have
 * to translate it back.
 */
export const VAULT_SESSION_HEADER = "X-Warpmetal-Customer-Authorization";

export interface RemoteVaultSettings {
  /** Base URL, without a trailing slash. Never contains a secret. */
  readonly baseUrl: string;
  /** `null` when there is no usable session; every operation then fails closed. */
  readonly token: string | null;
  /** Where the token came from, for `env status`. Never the token itself. */
  readonly tokenSource: "env" | "session" | null;
  /** Where the device flow writes a session. Used in the "sign in" hint only. */
  readonly sessionFile: string;
}

interface RemoteEntry {
  readonly name: string;
  readonly keyVersion: number;
  readonly updatedAt: string;
}

interface RemoteListing {
  /** Server-reported vault version, when it offers one. */
  readonly version: number | null;
  readonly entries: readonly RemoteEntry[];
}

const MAX_DETAIL = 200;

/**
 * Reads the list body. Returns `null` - never an empty vault - when the shape is
 * not understood: an unrecognized body reported as "no secrets" would make a
 * write look like a create and let a precondition pass against a vault this
 * client cannot actually see.
 */
function parseListing(json: unknown): RemoteListing | null {
  if (typeof json !== "object" || json === null) return null;
  const record = json as Record<string, unknown>;
  const raw = record["credentials"];
  if (!Array.isArray(raw)) return null;

  const entries: RemoteEntry[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const row = item as Record<string, unknown>;
    const name = row["name"];
    if (typeof name !== "string" || name.length === 0) return null;
    const keyVersion = row["keyVersion"];
    const updatedAt = row["updatedAt"];
    entries.push({
      name,
      keyVersion: typeof keyVersion === "number" && Number.isFinite(keyVersion) ? keyVersion : 0,
      updatedAt: typeof updatedAt === "string" ? updatedAt : "",
    });
  }

  const version = record["version"];
  return {
    version: typeof version === "number" && Number.isFinite(version) ? version : null,
    entries,
  };
}

function parseValue(json: unknown, name: string): string | null {
  if (typeof json !== "object" || json === null) return null;
  const value = (json as Record<string, unknown>)["value"];
  if (typeof value !== "string" || value.length === 0) {
    throw new CliError(
      "vault_corrupt",
      `the remote vault returned no value for \`${name}\`; it may be stored but undecryptable`,
    );
  }
  return value;
}

/**
 * A stable digest of the slot metadata, used only when the server reports no
 * version of its own. FNV-1a over sorted `(name, keyVersion, updatedAt)` rows:
 * stable across processes, changes whenever the server state changes.
 */
function digestEntries(entries: readonly RemoteEntry[]): number {
  const material = entries
    .map((entry) => `${entry.name}\u0000${entry.keyVersion}\u0000${entry.updatedAt}`)
    .sort((left, right) => left.localeCompare(right))
    .join("\n");

  let hash = 0x811c9dc5;
  for (let index = 0; index < material.length; index += 1) {
    hash ^= material.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function listingVersion(listing: RemoteListing): number {
  return listing.version ?? digestEntries(listing.entries);
}

function bounded(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length === 0 ? "no detail" : collapsed.slice(0, MAX_DETAIL);
}

/** Only the server's own `error` field is echoed; a body could carry a secret. */
function serverDetail(response: HttpResponse): string {
  const json = response.json;
  if (typeof json === "object" && json !== null) {
    const error = (json as Record<string, unknown>)["error"];
    if (typeof error === "string" && error.length > 0) return bounded(error);
  }
  return "no detail";
}

function needsAuth(sessionFile: string): CliError {
  return new CliError(
    "provider_auth",
    `no customer session for the remote vault. Sign in with the customer CLI device flow to write ${sessionFile}, or set ${VAULT_TOKEN_ENV}. Nothing was read or written locally.`,
  );
}

export class RemoteBackend implements SecretBackend {
  readonly kind = "remote" as const;
  readonly #settings: RemoteVaultSettings;
  readonly #http: HttpFn;

  constructor(settings: RemoteVaultSettings, http: HttpFn) {
    this.#settings = settings;
    this.#http = http;
  }

  info(): BackendInfo {
    const { baseUrl, token, sessionFile } = this.#settings;
    return {
      kind: "remote",
      location: baseUrl,
      detail:
        token === null
          ? `no customer session; every read and write fails closed until you sign in (${sessionFile})`
          : "server-side vault: values never touch local disk, and the server enforces compare-and-set per name",
    };
  }

  #auth(): Record<string, string> {
    const token = this.#settings.token;
    if (token === null) throw needsAuth(this.#settings.sessionFile);
    return { [VAULT_SESSION_HEADER]: `Bearer ${token}` };
  }

  async #request(
    method: string,
    path: string,
    body?: unknown,
    extra?: Record<string, string>,
  ): Promise<HttpResponse> {
    const request: HttpRequest = {
      method,
      url: `${this.#settings.baseUrl}${path}`,
      headers: { ...this.#auth(), ...(extra ?? {}) },
      ...(body !== undefined ? { body } : {}),
    };
    return this.#http(request);
  }

  /** One failure taxonomy for the whole backend, so every caller maps alike. */
  #failure(response: HttpResponse, action: string, name?: string): CliError {
    const subject = name === undefined ? "the vault" : `\`${name}\``;

    if (response.status === 0) {
      return new CliError(
        "backend_unavailable",
        `cannot reach the remote vault (${action}): ${bounded(response.text)}`,
      );
    }
    if (response.status === 401 || response.status === 403) {
      // Rejected or expired session. Fail closed: the local backends are never
      // consulted as a substitute, so the operator sees the real problem.
      return new CliError(
        "provider_auth",
        `the remote vault rejected the session (${response.status} on ${action} ${subject}). Sign in again with the customer CLI device flow.`,
      );
    }
    if (response.status === 400 || response.status === 404 || response.status === 422) {
      return new CliError(
        "invalid_request",
        `the remote vault refused ${action} ${subject} (${response.status}): ${serverDetail(response)}`,
      );
    }
    if (response.status >= 500) {
      return new CliError(
        "backend_unavailable",
        `the remote vault failed (${response.status} on ${action} ${subject}): ${serverDetail(response)}`,
      );
    }
    return new CliError(
      "provider_error",
      `the remote vault refused ${action} ${subject} (${response.status}): ${serverDetail(response)}`,
    );
  }

  async #listing(): Promise<RemoteListing> {
    const response = await this.#request("GET", "");
    if (!response.ok) throw this.#failure(response, "list");
    const listing = parseListing(response.json);
    if (listing === null) {
      throw new CliError(
        "vault_corrupt",
        "the remote vault returned a listing this CLI does not understand; refusing to treat it as an empty vault",
      );
    }
    return listing;
  }

  async list(): Promise<readonly string[]> {
    const listing = await this.#listing();
    return listing.entries
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  }

  async get(name: string): Promise<string | null> {
    const response = await this.#request("GET", `/${encodeURIComponent(name)}`);
    if (response.status === 404) return null;
    if (!response.ok) throw this.#failure(response, "read", name);
    return parseValue(response.json, name);
  }

  async has(name: string): Promise<boolean> {
    // Presence from metadata: `env plan` and `env doctor` ask about dozens of
    // names and never need the values.
    const listing = await this.#listing();
    return listing.entries.some((entry) => entry.name === name);
  }

  async put(
    name: string,
    value: string,
    options?: { readonly ifGeneration?: number },
  ): Promise<number> {
    // The precondition is checked against the server's version, never against
    // anything this process remembers from an earlier call.
    const before = await this.#listing();
    const current = listingVersion(before);
    const expected = options?.ifGeneration;
    if (expected !== undefined && expected !== current) {
      throw new StaleWriteError(expected, current);
    }

    const exists = before.entries.some((entry) => entry.name === name);
    const first = exists ? await this.#rotate(name, value, expected) : await this.#create(name, value, expected);

    if (!first.ok) {
      if (first.status === 412 && expected !== undefined) {
        throw new StaleWriteError(expected, listingVersion(await this.#listing()));
      }
      // Lost the create race: the name appeared between the listing and the
      // write. With a precondition the caller must re-read; without one the
      // write is unambiguous, so retry once as a rotate.
      if (first.status === 409 && !exists) {
        const retry = expected === undefined ? await this.#rotate(name, value, undefined) : null;
        if (retry === null || !retry.ok) {
          throw new StaleWriteError(expected ?? current, listingVersion(await this.#listing()));
        }
      } else {
        throw this.#failure(first, "write", name);
      }
    }

    return this.#versionAfterWrite(current);
  }

  /**
   * The provider is the credential's own namespace, which is how every secret
   * in this CLI is already named (`cloudflare.token`). The server requires it
   * on create and refuses to let it drift on rotate, so a slot cannot be
   * re-provided as something else later.
   */
  #providerOf(name: string): string {
    return name.split(".")[0] ?? name;
  }

  #create(name: string, value: string, expected: number | undefined): Promise<HttpResponse> {
    return this.#request(
      "POST",
      "",
      { name, provider: this.#providerOf(name), value },
      this.#ifMatch(expected),
    );
  }

  #rotate(name: string, value: string, expected: number | undefined): Promise<HttpResponse> {
    return this.#request(
      "POST",
      `/${encodeURIComponent(name)}:rotate`,
      { value },
      this.#ifMatch(expected),
    );
  }

  #ifMatch(expected: number | undefined): Record<string, string> {
    return expected === undefined ? {} : { "if-match": `"${expected}"` };
  }

  /**
   * The write has already landed: a failed re-listing must not be reported as a
   * failed write, or `env store set` would return exit 6 for a stored secret.
   * The fallback is what a local backend would report; the next operation
   * re-reads the server's truth and a wrong guess only ever costs one retry.
   */
  async #versionAfterWrite(previous: number): Promise<number> {
    try {
      return listingVersion(await this.#listing());
    } catch {
      return previous + 1;
    }
  }

  async delete(name: string): Promise<boolean> {
    const response = await this.#request("DELETE", `/${encodeURIComponent(name)}`);
    if (response.status === 404) return false;
    if (!response.ok) throw this.#failure(response, "delete", name);
    return true;
  }

  async generation(): Promise<number> {
    return listingVersion(await this.#listing());
  }

  /**
   * A server vault exists as soon as it answers: there is no "not created yet"
   * state to distinguish from an empty one.
   */
  async exists(): Promise<boolean> {
    await this.#listing();
    return true;
  }

  /**
   * Refused on purpose.
   *
   * The version is the server's, so a client cannot bump it; and there is no
   * local key material here to retire. Pretending to rotate would report
   * success for an act that did nothing.
   */
  async rotate(): Promise<number> {
    throw new CliError(
      "unsupported",
      "the remote vault version is imposed by the server and cannot be bumped from this CLI.",
    );
  }

  /**
   * Removes a namespace one name at a time.
   *
   * The local backends delete a namespace in a single whole-payload write. The
   * server has no bulk revoke, so this is N sequential requests and N server
   * revisions; every name that was removed is reported, and a failure part way
   * through still returns what was removed rather than claiming nothing was.
   */
  async deletePrefix(prefix: string): Promise<readonly string[]> {
    if (prefix.length === 0) {
      throw new CliError("invalid_request", "refusing to remove an empty prefix from the remote vault.");
    }
    const listing = await this.#listing();
    const names = listing.entries
      .map((entry) => entry.name)
      .filter((name) => name.startsWith(prefix))
      .sort((left, right) => left.localeCompare(right));

    const removed: string[] = [];
    for (const name of names) {
      if (await this.delete(name)) removed.push(name);
    }
    return removed;
  }

  /**
   * Refused on purpose: destroying a tenant vault is an administrative act on
   * the server, not something a local CLI may trigger. Use `env revoke`, which
   * revokes one namespace at a time and is audited as such.
   */
  async destroy(): Promise<void> {
    throw new CliError(
      "unsupported",
      "the remote vault is not destroyed from this CLI; revoke the names you own with `warpmetal env revoke`.",
    );
  }
}

/**
 * Resolves the remote settings from the environment, or `null` when
 * `WARPMETAL_VAULT_URL` is absent (the local backends then apply).
 *
 * A missing or expired session is *not* a reason to return `null`: it yields
 * settings with `token: null`, so the remote backend still exists and every
 * operation fails closed with `NEEDS_AUTH` instead of quietly writing to disk.
 */
export async function resolveRemoteVault(options: {
  readonly env: NodeJS.ProcessEnv;
  readonly paths: EnvPaths;
  /** Test seam: overrides the session file read. */
  readonly readFile?: ((path: string) => Promise<string>) | undefined;
  /** Test seam: overrides the clock used for expiry. */
  readonly now?: (() => number) | undefined;
}): Promise<RemoteVaultSettings | null> {
  const raw = options.env[VAULT_URL_ENV];
  if (raw === undefined || raw.trim().length === 0) return null;

  const baseUrl = normalizeBaseUrl(raw);
  const sessionFile = options.paths.sessionFile;

  const explicit = options.env[VAULT_TOKEN_ENV];
  if (explicit !== undefined && explicit.trim().length > 0) {
    return { baseUrl, token: explicit.trim(), tokenSource: "env", sessionFile };
  }

  const token = await readSessionToken(
    sessionFile,
    options.readFile ?? defaultReadFile,
    options.now ?? Date.now,
  );
  return { baseUrl, token, tokenSource: token === null ? null : "session", sessionFile };
}

function normalizeBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new CliError("usage_error", `${VAULT_URL_ENV} is not a valid URL.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new CliError("usage_error", `${VAULT_URL_ENV} must be an http(s) URL.`);
  }
  if (url.search.length > 0 || url.hash.length > 0) {
    throw new CliError("usage_error", `${VAULT_URL_ENV} must not carry a query string or fragment.`);
  }
  return url.toString().replace(/\/+$/, "");
}

async function defaultReadFile(path: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return readFile(path, "utf8");
}

/**
 * A session is `{"accessToken": "...", "expiresAt": "<ISO 8601>"}`.
 *
 * Anything else - absent, unreadable, malformed, expired, empty token - reads
 * as "not signed in". A malformed session must never be reported as a network
 * error, and an expired token must never be sent: the server would reject it,
 * and the operator would be told to check the wrong thing.
 */
async function readSessionToken(
  sessionFile: string,
  readFile: (path: string) => Promise<string>,
  now: () => number,
): Promise<string | null> {
  let raw: string;
  try {
    raw = await readFile(sessionFile);
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const record = parsed as Record<string, unknown>;
  const token = record["accessToken"];
  if (typeof token !== "string" || token.trim().length === 0) return null;

  const expiresAt = record["expiresAt"];
  if (typeof expiresAt === "string") {
    const expiry = Date.parse(expiresAt);
    if (!Number.isNaN(expiry) && expiry <= now()) return null;
  }
  return token.trim();
}
