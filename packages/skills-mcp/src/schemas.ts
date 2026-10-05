/**
 * schemas.ts - shared Zod primitives for tool inputs.
 *
 * Two rules govern everything here:
 *
 *   1. Only constructs that Zod can convert to JSON Schema are used. `.refine()`
 *      and `.transform()` are unrepresentable and would make the SDK throw when
 *      it builds the tool list. Validation therefore leans on `.regex()`,
 *      `.min()` and `.max()`, which survive the conversion.
 *
 *   2. A path field is validated for *shape* only. The executor passes it to the
 *      CLI as a string and never opens it. That is precisely what keeps private
 *      keys out of this process, so nothing here may resolve or read a path.
 */
import { z } from "zod";

/**
 * Identifiers issued by the CLI (serverId, sandboxId, taskId, grantId...).
 * Deliberately narrow: no spaces, no shell metacharacters, 1-128 characters.
 */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export const serverIdSchema = z
  .string()
  .regex(ID_PATTERN, "serverId must match ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$");

export const sandboxIdSchema = z
  .string()
  .regex(ID_PATTERN, "sandboxId must match ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$");

export const taskIdSchema = z
  .string()
  .regex(ID_PATTERN, "taskId must match ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$");

export const operationIdSchema = z
  .string()
  .regex(ID_PATTERN, "operationId must match ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$");

export const grantIdSchema = z
  .string()
  .regex(ID_PATTERN, "grantId must match ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$");

export const planIdSchema = z
  .string()
  .regex(ID_PATTERN, "planId must match ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$");

/**
 * A filesystem path handed to the CLI. Single line, no NUL bytes. A path never
 * contains a line break, so this also rejects someone pasting inline key
 * material into a path field.
 */
export const pathOnlySchema = z
  .string()
  .min(1)
  .max(4096)
  .regex(/^[^\r\n\0]+$/, "must be a single-line filesystem path with no NUL bytes");

/**
 * The approval token returned by the matching `_plan` tool. Deliberately not
 * described as "a token from anywhere": it is only meaningful for the exact
 * effect the plan computed, and the server rejects it otherwise.
 */
export const approvalTokenSchema = z
  .string()
  .min(16)
  .max(4096)
  .regex(/^[A-Za-z0-9_\-.]+$/, "malformed approval token");

/** A DNS label, as the CLI's hostname and name fields require. */
export const dnsLabelSchema = z
  .string()
  .min(1)
  .max(63)
  .regex(
    /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/,
    "must be a lowercase DNS label: letters, digits and inner hyphens only",
  );

/** The sandbox sizes the live catalog publishes. Never invented, always validated. */
export const sandboxSizes = ["small", "medium", "large", "xlarge"] as const;
export const sandboxSizeSchema = z.enum(sandboxSizes);
export type SandboxSize = (typeof sandboxSizes)[number];

/**
 * The sandbox actions this server exposes. `make_persistent` and `refresh_image`
 * are deliberately absent: they are irreversible or disruptive, and live behind
 * the hardened broker instead.
 */
export const sandboxActions = ["start", "stop", "restart"] as const;
export const sandboxActionSchema = z.enum(sandboxActions);
export type SandboxAction = (typeof sandboxActions)[number];

/** Temporary sandboxes expire between 15 minutes and 24 hours after first running. */
export const MIN_TEMPORARY_SECONDS = 900;
export const MAX_TEMPORARY_SECONDS = 86_400;

export const expiresInSecondsSchema = z
  .number()
  .int()
  .min(MIN_TEMPORARY_SECONDS)
  .max(MAX_TEMPORARY_SECONDS);

/** Poll budget for `wm_task_wait`. The ceiling is enforced here, not only in the loop. */
export const deadlineSecondsSchema = z.number().int().min(1).max(300);

/**
 * The irreversible damage an action does, as a closed vocabulary. Each class is
 * a different sentence a human has to be shown, and none of them is a synonym
 * for another: confusing `container_filesystem` with `workspace_deletion` would
 * make the human approve a text that overstates the loss, which is its own kind
 * of lie.
 *
 * `availability` is the odd one out: a reboot or a shutdown destroys nothing,
 * but it takes the server away for a while, and that is a real consequence for
 * anyone with work on it.
 */
export const CONSEQUENCE_CLASSES = [
  "availability",
  "server_erasure",
  "workspace_deletion",
  "expiry_protection_removed",
  "container_filesystem",
  "access_revocation",
  "profile_replacement",
] as const;

export type ConsequenceClass = (typeof CONSEQUENCE_CLASSES)[number];

export const consequenceSchema = z.enum(CONSEQUENCE_CLASSES);

/**
 * The caller's acknowledgement of the damage. Required exactly when the action
 * declares a consequence, and it must name the declared one: a value copied from
 * a different action is a refusal, not a retry.
 *
 * What this cannot do, stated here because the field invites the opposite
 * reading: it does not prove a human read anything. It proves the model had the
 * word, which is what makes a silent approval impossible rather than a lie
 * detectable. The same limit applies to the approval token.
 */
export const acknowledgedConsequenceSchema = consequenceSchema;

/** The server power actions. `boot` destroys nothing; `reboot` and `shutdown` both interrupt service. */
export const powerActions = ["boot", "reboot", "shutdown"] as const;
export const powerActionSchema = z.enum(powerActions);
export type PowerAction = (typeof powerActions)[number];

/**
 * The irreversible sandbox lifecycle actions. Kept out of `sandboxActionSchema`
 * on purpose: that enum is asserted to be exactly start/stop/restart, and widening
 * it would turn a tested guarantee into a promise.
 */
export const lifecycleActions = ["make_persistent", "refresh_image"] as const;
export const lifecycleActionSchema = z.enum(lifecycleActions);
export type LifecycleAction = (typeof lifecycleActions)[number];
