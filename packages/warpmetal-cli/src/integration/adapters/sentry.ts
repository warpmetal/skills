import { knownFlags, requireFlag, type ParsedArgs } from "../../args.js";
import { CliError } from "../../errors.js";
import { findProvider } from "../registry.js";
import {
  failure,
  needsAuth,
  ok,
  type Adapter,
  type AdapterContext,
  type AdapterResult,
} from "./types.js";

const TOKEN_SECRET = "sentry.token";
const API = "https://sentry.io/api/0";

/**
 * Sentry issue reads.
 *
 * The token is verified by listing organizations, which requires auth and
 * mutates nothing. Triage actions (resolve, assign, ignore) are deliberately
 * absent: they change shared state and belong to a human.
 */
export const sentryAdapter: Adapter = {
  spec: findProvider("sentry")!,

  gates: {},

  async status(context: AdapterContext): Promise<AdapterResult> {
    const token = await context.store.read(TOKEN_SECRET);
    if (token === null) {
      return needsAuth("sentry", "status", `No ${TOKEN_SECRET} in the store. Run \`warpmetal env store set ${TOKEN_SECRET}\`.`);
    }
    context.redactor.add(token);

    const response = await context.http({
      method: "GET",
      url: `${API}/organizations/`,
      headers: { authorization: `Bearer ${token}` },
    });

    if (response.status === 0) {
      return { provider: "sentry", verb: "status", status: "DEGRADED", warnings: ["Sentry unreachable; token validity is unknown."] };
    }
    if (response.status === 401 || response.status === 403) {
      return { provider: "sentry", verb: "status", status: "NEEDS_AUTH", warnings: ["Sentry rejected the stored auth token."] };
    }
    if (!response.ok) {
      return failure("sentry", "status", `Sentry responded with HTTP ${response.status}.`);
    }

    const body = response.json as Array<{ slug?: string }> | null;
    return {
      provider: "sentry",
      verb: "status",
      status: "OK",
      mode: "api_token",
      data: {
        organizationCount: Array.isArray(body) ? body.length : 0,
        note: "The token's scopes decide which projects it can read; that is not introspectable here.",
      },
    };
  },

  async run(verb: string, args: ParsedArgs, context: AdapterContext): Promise<AdapterResult> {
    if (verb !== "issue-list") {
      throw new CliError("usage_error", `Unknown sentry verb: ${verb}. Try: status, issue-list.`);
    }
    knownFlags(args, ["org", "project", "query", "json"]);
    const org = requireFlag(args, "org");
    const project = requireFlag(args, "project");

    const token = await context.store.read(TOKEN_SECRET);
    if (token === null) return needsAuth("sentry", verb, `No ${TOKEN_SECRET} in the store.`);
    context.redactor.add(token);

    const query = new URLSearchParams();
    const queryFlag = args.flags.get("query");
    if (typeof queryFlag === "string") query.set("query", queryFlag);

    const path = `${API}/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/${query.size > 0 ? `?${query.toString()}` : ""}`;
    const response = await context.http({
      method: "GET",
      url: path,
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.status === 0) return failure("sentry", verb, "Sentry unreachable.");
    if (response.status === 401 || response.status === 403) {
      return needsAuth("sentry", verb, "Sentry rejected the stored token, or it lacks scope for this project.");
    }
    if (response.status === 404) return failure("sentry", verb, `The organization or project does not exist, or the token cannot see it.`);
    if (!response.ok) return failure("sentry", verb, `Sentry responded with HTTP ${response.status}.`);

    const body = response.json as Array<{ id?: string; shortId?: string; title?: string; count?: string }> | null;
    const issues = (Array.isArray(body) ? body : []).map((issue) => ({
      id: issue.id ?? null,
      shortId: issue.shortId ?? null,
      title: issue.title ?? null,
      count: issue.count ?? null,
    }));
    return ok("sentry", verb, { count: issues.length, issues });
  },
};
