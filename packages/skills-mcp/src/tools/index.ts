/**
 * index.ts - the complete tool registry.
 *
 * Order is stable so the list stays diffable, and it is grouped by capability:
 * a reader looking for "what can this server do to my infrastructure" should
 * see the mutations together, not scattered.
 *
 * Read-only:    discovery, inspect, order, access                     (15)
 * Tasks:        the ephemeral registry, and its observation tools       (3)
 * Latch:        the read half of the manual_review memory               (1)
 * Mutations:    mutate, as plan/apply pairs                            (12)
 * Destructive:  destructive, as plan/apply pairs                       (12)
 *                                                                  -----
 *                                                                     43
 */
import { accessTools } from "./access.js";
import { destructiveTools, latchTools } from "./destructive.js";
import { discoveryTools } from "./discovery.js";
import { inspectTools } from "./inspect.js";
import { mutationTools } from "./mutate.js";
import { orderTools } from "./order.js";
import type { WmToolSpec } from "./spec.js";
import { taskTools } from "./tasks.js";

export const ALL_TOOL_SPECS: readonly WmToolSpec[] = [
  ...discoveryTools,
  ...inspectTools,
  ...orderTools,
  ...accessTools,
  ...taskTools,
  ...mutationTools,
  ...destructiveTools,
  ...latchTools,
];

export {
  accessTools,
  destructiveTools,
  discoveryTools,
  inspectTools,
  latchTools,
  mutationTools,
  orderTools,
  taskTools,
};
export type { ServerDeps, ToolContext, WmToolSpec } from "./spec.js";
export { registerToolSpecs } from "./spec.js";
