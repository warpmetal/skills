import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SkillError } from "./errors.js";

export interface RegistryFile {
  path: string;
  sha256: string;
}

export interface RegistrySkill {
  name: string;
  version: string;
  description: string;
  path: string;
  roles: string[];
  hosts: string[];
  minimumWarpmetalCli?: string;
  tags: string[];
  files: RegistryFile[];
}

export interface Registry {
  schemaVersion: number;
  registryVersion: string;
  generatedAt?: string;
  skills: RegistrySkill[];
}

export type RegistrySource = "bundled" | "local" | "remote";

export interface LoadedRegistry {
  registry: Registry;
  source: RegistrySource;
  /** Filesystem directory containing `skills/` for bundled and local registries. */
  rootDir: string | null;
  /** Base URL for remote file reads. */
  baseUrl: string | null;
  /** True when the preferred source failed and a fallback was served. */
  stale: boolean;
  /** Where the registry was resolved from, for diagnostics. */
  resolvedFrom: string;
}

export interface LoadOptions {
  registry?: string;
  tag?: string;
  cacheDir?: string;
  offline?: boolean;
}

const DEFAULT_REGISTRY_URL = "https://skills.warpmetal.com";
const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const FILE_PATH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export function sha256Hex(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function cacheDirectory(override?: string): string {
  if (override) return resolve(override);
  const xdg = process.env.XDG_CACHE_HOME;
  if (xdg) return join(xdg, "warpmetal", "skills-mcp");
  return join(homedir(), ".cache", "warpmetal", "skills-mcp");
}

export function bundledRegistryRoot(): string {
  return fileURLToPath(new URL("../snapshot/", import.meta.url));
}

function registryBaseUrl(): string {
  return (process.env.WARPMETAL_SKILLS_REGISTRY_URL ?? DEFAULT_REGISTRY_URL).replace(/\/+$/, "");
}

export function registryUrlForTag(tag: string): string {
  return `${registryBaseUrl()}/${encodeURIComponent(tag)}/registry.json`;
}

function fail(origin: string, detail: string): never {
  throw new SkillError("registry_unavailable", `${origin}: ${detail}`);
}

function assertRecord(value: unknown, origin: string, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(origin, `${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function optionalStringArray(value: unknown, origin: string, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    fail(origin, `${label} must be an array of strings`);
  }
  return value as string[];
}

function assertPlainFilePath(path: string, origin: string): string {
  if (!FILE_PATH_PATTERN.test(path)) fail(origin, `unsafe file path: ${path}`);
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    fail(origin, `unsafe file path: ${path}`);
  }
  return path;
}

export function validateRegistry(value: unknown, origin: string): Registry {
  const root = assertRecord(value, origin, "registry");
  if (root.schemaVersion !== 1) fail(origin, `unsupported schemaVersion: ${String(root.schemaVersion)}`);
  if (typeof root.registryVersion !== "string" || !VERSION_PATTERN.test(root.registryVersion)) {
    fail(origin, "registryVersion must be a semver string");
  }
  if (root.generatedAt !== undefined && typeof root.generatedAt !== "string") {
    fail(origin, "generatedAt must be a string");
  }
  if (!Array.isArray(root.skills)) fail(origin, "skills must be an array");

  const seen = new Set<string>();
  const skills: RegistrySkill[] = root.skills.map((entry, index) => {
    const skill = assertRecord(entry, origin, `skills[${index}]`);
    const name = skill.name;
    if (typeof name !== "string" || !NAME_PATTERN.test(name)) {
      fail(origin, `skills[${index}].name is invalid`);
    }
    if (seen.has(name)) fail(origin, `duplicate skill name: ${name}`);
    seen.add(name);
    if (typeof skill.version !== "string" || !VERSION_PATTERN.test(skill.version)) {
      fail(origin, `${name}: version must be a semver string`);
    }
    if (typeof skill.description !== "string" || skill.description.length === 0) {
      fail(origin, `${name}: description is required`);
    }
    if (skill.path !== `skills/${name}`) fail(origin, `${name}: path must be skills/${name}`);
    if (!Array.isArray(skill.files) || skill.files.length === 0) {
      fail(origin, `${name}: files must be a non-empty array`);
    }
    const files: RegistryFile[] = skill.files.map((fileEntry, fileIndex) => {
      const file = assertRecord(fileEntry, origin, `${name}.files[${fileIndex}]`);
      if (typeof file.path !== "string") fail(origin, `${name}: file path must be a string`);
      const filePath = assertPlainFilePath(file.path, origin);
      if (typeof file.sha256 !== "string" || !SHA256_PATTERN.test(file.sha256)) {
        fail(origin, `${name}: file ${filePath} has an invalid sha256`);
      }
      return { path: filePath, sha256: file.sha256 };
    });
    files.sort((left, right) => left.path.localeCompare(right.path));

    if (skill.minimumWarpmetalCli !== undefined && typeof skill.minimumWarpmetalCli !== "string") {
      fail(origin, `${name}: minimumWarpmetalCli must be a string`);
    }

    return {
      name,
      version: skill.version,
      description: skill.description,
      path: `skills/${name}`,
      roles: optionalStringArray(skill.roles, origin, `${name}.roles`),
      hosts: optionalStringArray(skill.hosts, origin, `${name}.hosts`),
      ...(typeof skill.minimumWarpmetalCli === "string"
        ? { minimumWarpmetalCli: skill.minimumWarpmetalCli }
        : {}),
      tags: optionalStringArray(skill.tags, origin, `${name}.tags`),
      files,
    };
  });

  return {
    schemaVersion: 1,
    registryVersion: root.registryVersion,
    ...(typeof root.generatedAt === "string" ? { generatedAt: root.generatedAt } : {}),
    skills,
  };
}

async function loadLocalRegistry(rootDir: string, source: RegistrySource): Promise<LoadedRegistry> {
  const path = join(rootDir, "registry.json");
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    throw new SkillError(
      "registry_unavailable",
      `no registry found at ${path}: ${(error as Error).message}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new SkillError("registry_unavailable", `${path}: invalid JSON: ${(error as Error).message}`);
  }
  return {
    registry: validateRegistry(parsed, path),
    source,
    rootDir: resolve(rootDir),
    baseUrl: null,
    stale: false,
    resolvedFrom: path,
  };
}

async function loadRemoteRegistry(
  url: string,
  cacheDir: string,
  offline: boolean,
  fallback: () => Promise<LoadedRegistry>,
): Promise<LoadedRegistry> {
  const key = sha256Hex(url).slice(0, 24);
  const cacheFile = join(cacheDir, `${key}.json`);
  const etagFile = join(cacheDir, `${key}.etag`);
  let cachedText: string | undefined;
  try {
    cachedText = await readFile(cacheFile, "utf8");
  } catch {
    cachedText = undefined;
  }
  let etag: string | undefined;
  try {
    etag = (await readFile(etagFile, "utf8")).trim() || undefined;
  } catch {
    etag = undefined;
  }

  const fromCache = (stale: boolean, reason: string): LoadedRegistry => ({
    registry: validateRegistry(JSON.parse(cachedText as string), cacheFile),
    source: "remote",
    rootDir: null,
    baseUrl: new URL(".", url).href,
    stale,
    resolvedFrom: `${cacheFile} (${reason})`,
  });

  if (!offline) {
    try {
      const headers: Record<string, string> = { accept: "application/json" };
      if (etag) headers["if-none-match"] = etag;
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
      if (response.status === 304 && cachedText !== undefined) {
        return fromCache(false, "cache revalidated");
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const registry = validateRegistry(JSON.parse(text), url);
      await mkdir(cacheDir, { recursive: true, mode: 0o700 });
      await writeFile(cacheFile, text, { mode: 0o600 });
      const nextEtag = response.headers.get("etag");
      if (nextEtag) await writeFile(etagFile, nextEtag, { mode: 0o600 });
      return {
        registry,
        source: "remote",
        rootDir: null,
        baseUrl: new URL(".", url).href,
        stale: false,
        resolvedFrom: url,
      };
    } catch (error) {
      if (cachedText !== undefined) return fromCache(true, `offline fallback: ${(error as Error).message}`);
      const bundled = await fallback();
      return { ...bundled, stale: true };
    }
  }

  if (cachedText !== undefined) return fromCache(true, "offline mode");
  const bundled = await fallback();
  return { ...bundled, stale: true };
}

export async function loadRegistry(options: LoadOptions = {}): Promise<LoadedRegistry> {
  const registry = options.registry ?? process.env.WARPMETAL_SKILLS_REGISTRY;
  const cacheDir = cacheDirectory(options.cacheDir);
  const bundled = () => loadLocalRegistry(bundledRegistryRoot(), "bundled");

  if (registry) {
    if (/^https?:\/\//i.test(registry)) {
      return loadRemoteRegistry(registry, cacheDir, options.offline === true, bundled);
    }
    return loadLocalRegistry(resolve(registry), "local");
  }

  // Dynamic by default: resolve the requested tag (latest unless pinned) from
  // the catalog host, revalidate against the cached copy, and fall back to the
  // bundled snapshot only when both the network and cache are unavailable.
  return loadRemoteRegistry(
    registryUrlForTag(options.tag ?? "latest"),
    cacheDir,
    options.offline === true,
    bundled,
  );
}
