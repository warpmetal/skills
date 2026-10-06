/**
 * Action Gateway catalog: aggregates every `catalog/batch-*.json` into one
 * flat, de-duplicated tool list.
 *
 * Adding a batch = drop a new `batch-NN.json` in `catalog/`, add one import,
 * and add it to `BATCHES`. Everything downstream (register, session preload,
 * policy) reads this aggregated surface.
 */
import batch01Json from "./catalog/batch-01.json" with { type: "json" };
import batch02Json from "./catalog/batch-02.json" with { type: "json" };
import batch03Json from "./catalog/batch-03.json" with { type: "json" };
import batch04Json from "./catalog/batch-04.json" with { type: "json" };
import batch05Json from "./catalog/batch-05.json" with { type: "json" };
import batch06Json from "./catalog/batch-06.json" with { type: "json" };
import batch07Json from "./catalog/batch-07.json" with { type: "json" };
import batch08Json from "./catalog/batch-08.json" with { type: "json" };
import batch09Json from "./catalog/batch-09.json" with { type: "json" };
import batch10Json from "./catalog/batch-10.json" with { type: "json" };

import type { AgCatalogFile, AgCatalogTool } from "./types.js";

const BATCHES = [
  batch01Json,
  batch02Json,
  batch03Json,
  batch04Json,
  batch05Json,
  batch06Json,
  batch07Json,
  batch08Json,
  batch09Json,
  batch10Json,
] as unknown as AgCatalogFile[];

const tools = BATCHES.flatMap((batch) => batch.tools);

const seenSlugs = new Set<string>();
for (const tool of tools) {
  if (seenSlugs.has(tool.toolSlug)) {
    throw new Error(
      `duplicate Action Gateway toolSlug across batches: ${tool.toolSlug}`,
    );
  }
  seenSlugs.add(tool.toolSlug);
}

/** Total number of Action Gateway tools registered across all batches. */
export const AG_TOOL_COUNT = tools.length;

export function loadAgCatalog(): readonly AgCatalogTool[] {
  return tools;
}

export function agToolSlugs(): readonly string[] {
  return tools.map((tool) => tool.toolSlug);
}
