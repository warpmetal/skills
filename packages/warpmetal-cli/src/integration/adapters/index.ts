import { findProvider, PROVIDERS } from "../registry.js";
import { cloudflareAdapter } from "./cloudflare.js";
import { githubAdapter } from "./github.js";
import { slackAdapter } from "./slack.js";
import type { Adapter } from "./types.js";

/**
 * The adapter table. One adapter per catalog entry, in catalog order, so
 * `providerNames()` and `adapters()` can never disagree about what exists.
 */
const ADAPTERS: readonly Adapter[] = [cloudflareAdapter, githubAdapter, slackAdapter];

export function adapters(): readonly Adapter[] {
  return ADAPTERS;
}

export function findAdapter(name: string): Adapter | undefined {
  return ADAPTERS.find((adapter) => adapter.spec.name === name);
}

export function capabilitiesOf(name: string): readonly string[] {
  return findProvider(name)?.capabilities ?? [];
}

export type { Adapter, AdapterContext, AdapterResult, AdapterStatus } from "./types.js";

// A catalog entry without an adapter would be a lie in `integration list`, so
// this fails fast at import time rather than at first use.
for (const spec of PROVIDERS) {
  if (findAdapter(spec.name) === undefined) {
    throw new Error(`No adapter implements the "${spec.name}" provider declared in the catalog.`);
  }
}
