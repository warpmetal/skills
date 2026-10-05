/**
 * order.ts - order and payment *observation* only.
 *
 * Preparing an order, resolving a checkout challenge and authorising payment
 * all move money or mutate state, so they are deliberately absent: they need a
 * spending policy, not just an approval token. The only order verb exposed is
 * a read.
 */
import { z } from "zod";

import { taskIdSchema } from "../schemas.js";
import { stateOf, taskRecord } from "../shapes.js";
import { asRecord, str, type WmToolSpec } from "./spec.js";

export const orderTools: readonly WmToolSpec[] = [
  {
    name: "wm_order_status",
    title: "Get order status",
    description:
      "Returns the state of a purchase or provisioning task. Read-only, single poll. An accepted or pending task is reported as PENDING with exit code 8; it is never reported as applied. manual_review is terminal for payment and mutation attempts.",
    input: z.strictObject({ taskId: taskIdSchema }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    cli: "orderStatus",
    flags: { task: "taskId" },
    summary: ({ data, status }) => {
      // `order status` emits `{ task, nextAction? }`: the state is on the task,
      // and `nextAction` is the only field it adds at the top level.
      const record = taskRecord(data);
      const state = stateOf(record);
      const nextAction = str(asRecord(asRecord(data)?.["nextAction"])?.["action"]);
      if (state === null) {
        return `order reported as ${status}`;
      }
      return nextAction === null
        ? `order ${state}`
        : `order ${state}, nextAction ${nextAction}`;
    },
    extraWarnings: ({ data }) => {
      const record = taskRecord(data);
      const state = stateOf(record);
      const warnings: string[] = [];
      if (state === "manual_review") {
        warnings.push(
          "manual_review_terminal: do not retry payment or any mutation for this task. Only a later read-only status check may observe the backend reconciliation.",
        );
      }
      const failure = asRecord(record?.["failure"]);
      const code = str(failure?.["code"]);
      if (code === "payment_expired_unsettled" && record?.["retrySafe"] === true) {
        warnings.push(
          "retry_safe_payment_expired: this is the only combination that permits preparing a replacement order",
        );
      }
      return warnings;
    },
    nextActions: ({ args, data }) => {
      const record = taskRecord(data);
      const state = stateOf(record);
      const terminal =
        state !== null && ["ready", "failed", "expired", "manual_review"].includes(state);
      if (terminal) {
        return [];
      }
      return [
        {
          action: "poll the order again; a pending order is not a provisioned server",
          tool: "wm_order_status",
          args: { taskId: args["taskId"] },
        },
      ];
    },
  },
];
