import { SkillError } from "./errors.js";

export interface CliOptions {
  registry?: string;
  tag?: string;
  cacheDir?: string;
  offline: boolean;
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
  "--port",
  "--host",
]);

const BOOLEAN_FLAGS = new Set(["--http", "--offline", "--help", "-h", "--version", "-V"]);

export function parseArguments(argv: string[]): CliOptions {
  const options: CliOptions = {
    offline: false,
    http: false,
    port: numberFromEnv("PORT", DEFAULT_PORT),
    host: process.env.WARPMETAL_SKILLS_HOST ?? DEFAULT_HOST,
    help: false,
    version: false,
  };

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
        case "--port":
          options.port = parsePort(value);
          break;
        case "--host":
          options.host = value;
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
  --tag <version>        Load a pinned registry tag from the catalog host
  --offline              Never fetch a remote registry; use cache or bundled snapshot
  --http                 Serve Streamable HTTP instead of stdio
  --host <address>       HTTP bind address (default ${DEFAULT_HOST})
  --port <number>        HTTP port (default ${DEFAULT_PORT})
  --cache-dir <path>     Override the registry cache directory
  --version, -V          Print the version
  --help, -h             Show this help

Environment:
  WARPMETAL_SKILLS_REGISTRY      Default value for --registry
  WARPMETAL_SKILLS_REGISTRY_URL  Base catalog URL (default https://skills.warpmetal.com)
  WARPMETAL_SKILLS_HOST          Default value for --host
  PORT                           Default value for --port
  XDG_CACHE_HOME                 Cache root when --cache-dir is not set

Transports:
  stdio (default)   Suitable for local MCP hosts (omp, Claude Code, Codex, Cursor, OpenCode)
  --http            POST /mcp, GET /healthz, GET /readyz
`;
}
