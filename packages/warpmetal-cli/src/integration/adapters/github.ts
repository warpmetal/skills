import { knownFlags, requireFlag, type ParsedArgs } from "../../args.js";
import { CliError } from "../../errors.js";
import { toolAvailable } from "../../run.js";
import { findProvider } from "../registry.js";
import {
  failure,
  needsAuth,
  type Adapter,
  type AdapterContext,
  type AdapterResult,
} from "./types.js";

const TOKEN_SECRET = "github.token";
const API = "https://api.github.com";

/**
 * GitHub access.
 *
 * Two auth modes with different failure stories. A local `gh` session is
 * preferred because GitHub, not this CLI, holds the credential and this CLI
 * never has to store it. A stored PAT is the fallback for CI and headless
 * machines. The adapter never claims to know the token's scopes: GitHub does
 * not expose classic PAT scopes through the API, so `status` reports identity
 * and nothing more.
 */
export const githubAdapter: Adapter = {
  spec: findProvider("github")!,

  // Read-only access in this release; there is no mutating verb to gate yet.
  gates: {},

  async status(context: AdapterContext): Promise<AdapterResult> {
    const hasGh = await toolAvailable(context.run, "gh");

    if (hasGh) {
      const result = await context.run("gh", ["auth", "status", "--json", "hosts"]);
      if (result.code === 0) {
        return {
          provider: "github",
          verb: "status",
          status: "OK",
          mode: "gh_session",
          data: { tool: "gh", scopes: "unknown", note: "Credential lives in the gh keychain, not in the warpmetal store." },
        };
      }
      const token = await context.store.read(TOKEN_SECRET);
      if (token === null) {
        return needsAuth("github", "status", "gh is installed but not authenticated, and no github.token is stored.");
      }
      // gh present but logged out: fall through to the token path below.
    }

    const token = await context.store.read(TOKEN_SECRET);
    if (token === null) {
      return needsAuth(
        "github",
        "status",
        hasGh
          ? "No GitHub credential. Run `gh auth login` or store github.token."
          : "gh is not installed and no github.token is stored.",
      );
    }
    context.redactor.add(token);

    const response = await context.http({
      method: "GET",
      url: `${API}/user`,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "warpmetal-cli",
      },
    });

    if (response.status === 0) {
      return { provider: "github", verb: "status", status: "DEGRADED", warnings: ["GitHub unreachable; token validity is unknown."] };
    }
    if (response.status === 401) {
      return { provider: "github", verb: "status", status: "NEEDS_AUTH", warnings: ["GitHub rejected the stored token."] };
    }
    if (!response.ok) {
      return failure("github", "status", `GitHub responded with HTTP ${response.status}.`);
    }
    const login = (response.json as { login?: string } | null)?.login ?? null;
    return {
      provider: "github",
      verb: "status",
      status: "OK",
      mode: "personal_access_token",
      data: { login, scopes: "unknown", note: "GitHub does not expose token scopes; none are claimed." },
    };
  },

  async run(verb: string, args: ParsedArgs, context: AdapterContext): Promise<AdapterResult> {
    if (verb !== "repo-view") {
      throw new CliError("usage_error", `Unknown github verb: ${verb}. Try: status, repo-view.`);
    }
    knownFlags(args, ["repo", "json"]);
    const repo = requireFlag(args, "repo");
    if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repo)) {
      throw new CliError("usage_error", "--repo must be owner/name.");
    }

    if (await toolAvailable(context.run, "gh")) {
      const result = await context.run("gh", ["repo", "view", repo, "--json", "name,visibility,defaultBranchRef,isPrivate"]);
      if (result.code === 0) {
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(result.stdout);
        } catch {
          parsed = null;
        }
        return { provider: "github", verb, status: "OK", mode: "gh_session", data: { repo, detail: parsed } };
      }
    }

    const token = await context.store.read(TOKEN_SECRET);
    if (token === null) {
      return needsAuth("github", verb, "No GitHub credential available for repo-view.");
    }
    context.redactor.add(token);

    const response = await context.http({
      method: "GET",
      url: `${API}/repos/${repo}`,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "warpmetal-cli",
      },
    });
    if (response.status === 0) return failure("github", verb, "GitHub unreachable.");
    if (response.status === 404) return failure("github", verb, `Repository ${repo} not found, or the token cannot see it.`);
    if (!response.ok) return failure("github", verb, `GitHub responded with HTTP ${response.status}.`);

    const body = response.json as { full_name?: string; private?: boolean; default_branch?: string } | null;
    return {
      provider: "github",
      verb,
      status: "OK",
      mode: "personal_access_token",
      data: {
        repo: body?.full_name ?? repo,
        private: body?.private ?? null,
        defaultBranch: body?.default_branch ?? null,
      },
    };
  },
};
