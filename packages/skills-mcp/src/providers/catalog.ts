/**
 * Provider catalog: aggregates every `catalog/<provider>.json` (one file per
 * `toolkitId`) into one flat, de-duplicated tool list.
 */
import { CATALOG_FILES } from "./catalog/index.js";
import type { ProviderCatalogTool } from "./types.js";

// A file name and the tools inside it must agree, so a mis-filed tool fails
// loudly at startup instead of silently landing under the wrong provider.
for (const file of CATALOG_FILES) {
  for (const tool of file.tools) {
    if (tool.toolkitId !== file.provider) {
      throw new Error(
        `provider catalog file ${file.provider}.json holds a ${tool.toolkitId} tool: ${tool.toolSlug}`,
      );
    }
  }
}

const tools = CATALOG_FILES.flatMap((file) => file.tools);

const seenSlugs = new Set<string>();
for (const tool of tools) {
  if (seenSlugs.has(tool.toolSlug)) {
    throw new Error(`duplicate provider toolSlug across providers: ${tool.toolSlug}`);
  }
  seenSlugs.add(tool.toolSlug);
}

/** Total number of provider tools registered across all providers. */
export const PROVIDER_TOOL_COUNT = tools.length;

export function loadProviderCatalog(): readonly ProviderCatalogTool[] {
  return tools;
}

export function providerToolSlugs(): readonly string[] {
  return tools.map((tool) => tool.toolSlug);
}
