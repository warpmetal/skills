import type { ParsedArgs } from "../../args.js";
import type { Redactor } from "../../output.js";
import type { CommandRunner } from "../../run.js";
import type { CredentialStore } from "../../env/store.js";
import type { HttpFn } from "../http.js";
import type { ProviderSpec } from "../registry.js";

/**
 * Adapter contract.
 *
 * `status` is a pure probe: it must never mutate anything upstream and must
 * never report a success it cannot verify. `run` handles the provider's verbs,
 * and the caller is responsible for having already checked the confirmation
 * gate - adapters receive the parsed flags but do not decide policy from them
 * beyond what the verb requires.
 */
export interface AdapterContext {
  readonly store: CredentialStore;
  readonly env: NodeJS.ProcessEnv;
  readonly run: CommandRunner;
  readonly http: HttpFn;
  readonly redactor: Redactor;
}

export type AdapterStatus = "OK" | "NEEDS_AUTH" | "DEGRADED" | "ERROR";

export interface AdapterResult {
  readonly provider?: string;
  readonly verb?: string;
  readonly status: AdapterStatus;
  readonly mode?: string;
  readonly data?: Record<string, unknown>;
  readonly warnings?: readonly string[];
  readonly errors?: readonly string[];
}

export interface Adapter {
  readonly spec: ProviderSpec;
  /** Verb -> the CONFIRM literal that must be present for that verb. */
  readonly gates: Readonly<Record<string, string>>;
  status(context: AdapterContext): Promise<AdapterResult>;
  run(verb: string, args: ParsedArgs, context: AdapterContext): Promise<AdapterResult>;
}

export function ok(provider: string, verb: string, data: Record<string, unknown>): AdapterResult {
  return { provider, verb, status: "OK", data };
}

export function needsAuth(provider: string, verb: string, hint: string): AdapterResult {
  return { provider, verb, status: "NEEDS_AUTH", warnings: [hint] };
}

export function failure(provider: string, verb: string, message: string): AdapterResult {
  return { provider, verb, status: "ERROR", errors: [message] };
}
