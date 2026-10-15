/**
 * Provider tools whose request shape could not be confirmed against the live
 * API with the credential modes this server supports.
 *
 * The mark is informational only: the tool still registers and can be called.
 * It exists so a client can surface "this may need a live check" instead of
 * treating an unverified contract as guaranteed.
 */
export const EXPERIMENTAL_MARKER =
  "[experimental: request shape not verified against the live API]";

export const EXPERIMENTAL_SLUGS: ReadonlySet<string> = new Set([
  // X rejects app-only bearer tokens on the write endpoint; publishing needs an
  // OAuth 2.0 token with user context, which this server does not collect yet.
  "x_create_posts",
]);

/** Prefixes the experimental marker on an unverified tool's description. */
export function withExperimentalMarker(toolSlug: string, description: string): string {
  return EXPERIMENTAL_SLUGS.has(toolSlug)
    ? `${EXPERIMENTAL_MARKER} ${description}`
    : description;
}
