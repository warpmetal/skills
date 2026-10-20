import { SkillError } from "./errors.js";

/**
 * The stdio profiles a caller can select.
 *
 * `content` is deliberately absent: it is the unauthenticated HTTP surface and
 * is chosen by `--http`, never by a flag. Keeping it out of this union is what
 * makes a stray profile value a parse error instead of a runtime surprise.
 */
export type CliProfile = "full" | "chatgpt-local";

const CLI_PROFILES = new Set<string>(["full", "chatgpt-local"]);

export interface CliOptions {
  registry?: string;
  tag?: string;
  cacheDir?: string;
  registryTokenFile?: string;
  profile: CliProfile;
  offline: boolean;
  noFallback: boolean;
  http: boolean;
  port: number;
  host: string;
  help: boolean;
  version: boolean;
}

export const DEFAULT_HOST = "0.0.0.0";
export const DEFAULT_PORT = 8080;

const VALUE_FLAGS = new Set([
  "--registry",
  "--tag",
  "--cache-dir",
  "--registry-token-file",
  "--port",
  "--host",
  "--profile",
]);

const BOOLEAN_FLAGS = new Set(["--http", "--offline", "--no-fallback", "--help", "-h", "--version", "-V"]);

export function parseArguments(argv: string[]): CliOptions {
  const options: CliOptions = {
    profile: "full",
    offline: false,
    noFallback: false,
    http: false,
    port: numberFromEnv("PORT", DEFAULT_PORT),
    host: process.env.WARPMETAL_SKILLS_HOST ?? DEFAULT_HOST,
    help: false,
    version: false,
  };
  // Tracked separately because `--profile full --http` must fail exactly like
  // `--profile chatgpt-local --http`: the contradiction is the flag's presence,
  // not the value it happens to carry.
  let profileExplicit = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) continue;

    if (VALUE_FLAGS.has(argument)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new SkillError("invalid_request", `${argument} requires a value`);
      }
      index += 1;
      switch (argument) {
        case "--registry":
          options.registry = value;
          break;
        case "--tag":
          options.tag = value;
          break;
        case "--cache-dir":
          options.cacheDir = value;
          break;
        case "--registry-token-file":
          options.registryTokenFile = value;
          break;
        case "--port":
          options.port = parsePort(value);
          break;
        case "--host":
          options.host = value;
          break;
        case "--profile":
          if (!CLI_PROFILES.has(value)) {
            throw new SkillError(
              "invalid_request",
              `invalid profile: ${value} (expected full or chatgpt-local)`,
            );
          }
          options.profile = value as CliProfile;
          profileExplicit = true;
          break;
        default:
          break;
      }
      continue;
    }

    if (BOOLEAN_FLAGS.has(argument)) {
      switch (argument) {
        case "--http":
          options.http = true;
          break;
        case "--offline":
          options.offline = true;
          break;
        case "--no-fallback":
          options.noFallback = true;
          break;
        case "--help":
        case "-h":
          options.help = true;
          break;
        case "--version":
        case "-V":
          options.version = true;
          break;
        default:
          break;
      }
      continue;
    }

    throw new SkillError("invalid_request", `unknown option: ${argument}`);
  }

  if (options.registry && options.tag) {
    throw new SkillError("invalid_request", "--registry and --tag are mutually exclusive");
  }
  if (options.offline && (options.registry || options.tag)) {
    throw new SkillError("invalid_request", "--offline cannot be combined with --registry or --tag");
  }
  if (options.offline && options.noFallback) {
    throw new SkillError(
      "invalid_request",
      "--no-fallback cannot be combined with --offline (offline serves a stale cache by definition)",
    );
  }
  if (options.http && profileExplicit) {
    // `--http` already selects the `content` profile; a `--profile` alongside it
    // is a contradiction, and `chatgpt-local` must never reach a socket.
    throw new SkillError("invalid_request", "--profile cannot be combined with --http");
  }

  return options;
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parsePort(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 65535) {
    throw new SkillError("invalid_request", `invalid port: ${value}`);
  }
  return parsed;
}

export function helpText(): string {
  return `warpmetal-skills-mcp - read-only MCP server for WarpMetal Agent Skills

Usage:
  warpmetal-skills-mcp [options]

Options:
  --registry <url|path>  Load registry.json from a URL or local directory
  --tag <version>        Pin a registry tag from the catalog host (default: latest)
  --offline              Never fetch; use the cached or bundled registry
  --no-fallback          Fail instead of serving a stale cached/bundled registry
  --http                 Serve Streamable HTTP instead of stdio
  --profile <name>       stdio profile: full (default) or chatgpt-local (no provider tools)
  --host <address>       HTTP bind address (default ${DEFAULT_HOST})
  --port <number>        HTTP port (default ${DEFAULT_PORT})
  --cache-dir <path>     Override the registry cache directory
  --registry-token-file <path>  Bearer token for an authenticated registry, read from a file
  --version, -V          Print the version
  --help, -h             Show this help

Registry resolution (default):
  1. --registry <url|path> or WARPMETAL_SKILLS_REGISTRY
  2. <catalog>/<tag>/registry.json, where tag defaults to latest
  3. cached copy from a previous load, revalidated with an ETag and marked stale
  4. bundled snapshot shipped with this package (marked stale)

Environment:
  WARPMETAL_SKILLS_REGISTRY       Default value for --registry
  WARPMETAL_SKILLS_REGISTRY_URL   Base catalog URL (default https://skills.warpmetal.com)
  WARPMETAL_SKILLS_REGISTRY_TOKEN Bearer token for an authenticated registry
  WARPMETAL_SKILLS_HOST           Default value for --host
  PORT                            Default value for --port
  XDG_CACHE_HOME                  Cache root when --cache-dir is not set

Transports:
  stdio (default)   Suitable for local MCP hosts (omp, Claude Code, Codex, Cursor, OpenCode)
  --http            POST /mcp, GET /healthz, GET /readyz
`;
}
