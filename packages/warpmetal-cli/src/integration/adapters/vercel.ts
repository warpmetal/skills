import { knownFlags, type ParsedArgs } from "../../args.js";
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

const TOKEN_SECRET = "vercel.token";
const API = "https://api.vercel.com";

/**
 * Vercel projects and deployments, read-only.
 *
 * The token is verified against the user endpoint, which mutates nothing. This
 * release never promotes, rolls back or redeploys; a deploy stays a human,
 * gated action.
 */
export const vercelAdapter: Adapter = {
  spec: findProvider("vercel")!,

  gates: {},

  async status(context: AdapterContext): Promise<AdapterResult> {
    const token = await context.store.read(TOKEN_SECRET);
    if (token === null) {
      return needsAuth("vercel", "status", `No ${TOKEN_SECRET} in the store. Run \`warpmetal env store set ${TOKEN_SECRET}\`.`);
    }
    context.redactor.add(token);

    const response = await context.http({
      method: "GET",
      url: `${API}/v2/user`,
      headers: { authorization: `Bearer ${token}` },
    });

    if (response.status === 0) {
      return { provider: "vercel", verb: "status", status: "DEGRADED", warnings: ["Vercel unreachable; token validity is unknown."] };
    }
    if (response.status === 401 || response.status === 403) {
      return { provider: "vercel", verb: "status", status: "NEEDS_AUTH", warnings: ["Vercel rejected the stored token."] };
    }
    if (!response.ok) {
      return failure("vercel", "status", `Vercel responded with HTTP ${response.status}.`);
    }

    const body = response.json as { user?: { username?: string; email?: string } } | null;
    return {
      provider: "vercel",
      verb: "status",
      status: "OK",
      mode: "api_token",
      data: {
        username: body?.user?.username ?? null,
        note: "Token scope follows the user or team it was minted for; the reachable projects are not enumerated here.",
      },
    };
  },

  async run(verb: string, args: ParsedArgs, context: AdapterContext): Promise<AdapterResult> {
    if (verb !== "deployment-list") {
      throw new CliError("usage_error", `Unknown vercel verb: ${verb}. Try: status, deployment-list.`);
    }
    knownFlags(args, ["project", "json"]);

    const token = await context.store.read(TOKEN_SECRET);
    if (token === null) return needsAuth("vercel", verb, `No ${TOKEN_SECRET} in the store.`);
    context.redactor.add(token);

    const query = new URLSearchParams({ limit: "20" });
    const project = args.flags.get("project");
    if (typeof project === "string") query.set("projectId", project);

    const response = await context.http({
      method: "GET",
      url: `${API}/v6/deployments?${query.toString()}`,
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.status === 0) return failure("vercel", verb, "Vercel unreachable.");
    if (response.status === 401 || response.status === 403) {
      return needsAuth("vercel", verb, "Vercel rejected the stored token, or it lacks scope for this team.");
    }
    if (!response.ok) return failure("vercel", verb, `Vercel responded with HTTP ${response.status}.`);

    const body = response.json as { deployments?: Array<{ uid?: string; name?: string; state?: string; url?: string }> } | null;
    const deployments = (body?.deployments ?? []).map((deployment) => ({
      uid: deployment.uid ?? null,
      name: deployment.name ?? null,
      state: deployment.state ?? null,
      url: deployment.url ?? null,
    }));
    return ok("vercel", verb, { count: deployments.length, deployments });
  },
};
