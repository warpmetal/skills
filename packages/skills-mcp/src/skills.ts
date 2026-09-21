import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { SkillError } from "./errors.js";
import { sha256Hex, type LoadedRegistry, type RegistrySkill } from "./registry.js";

/** Matches the build limit in scripts/lib/build.mjs. */
export const MAX_FILE_BYTES = 1_048_576;

export interface SkillSummary {
  name: string;
  version: string;
  description: string;
  roles: string[];
  hosts: string[];
  tags: string[];
  files: string[];
  minimumWarpmetalCli?: string;
}

export interface SearchHit {
  name: string;
  version: string;
  description: string;
  tags: string[];
  score: number;
}

export interface SkillFileContent {
  skill: RegistrySkill;
  file: string;
  text: string;
  mimeType: string;
  sha256: string;
}

/**
 * Rejects absolute paths, backslashes, empty/dot segments, and traversal.
 * The registry file list is also enforced as an allowlist on every read.
 */
export function normalizeSkillFilePath(input: string): string {
  if (typeof input !== "string" || input.length === 0) {
    throw new SkillError("invalid_path", "file path must be a non-empty string");
  }
  if (input.includes("\0") || input.includes("\\")) {
    throw new SkillError("invalid_path", "file path contains an unsupported character");
  }
  if (input.startsWith("/") || /^[A-Za-z]:/.test(input)) {
    throw new SkillError("invalid_path", "absolute file paths are rejected");
  }
  const segments = input.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") {
      throw new SkillError("traversal_rejected", "path traversal is rejected");
    }
  }
  return segments.join("/");
}

export function parseSkillUri(uri: string): { name: string; file: string } {
  if (typeof uri !== "string" || !uri.startsWith("skill://")) {
    throw new SkillError("invalid_path", `unsupported uri: ${String(uri)}`);
  }
  const rest = uri.slice("skill://".length);
  if (rest.length === 0 || rest.includes("?") || rest.includes("#")) {
    throw new SkillError("invalid_path", `unsupported uri: ${uri}`);
  }
  const rawSegments = rest.split("/");
  if (rawSegments[rawSegments.length - 1] === "") {
    throw new SkillError("invalid_path", "trailing slash is rejected");
  }
  let decoded: string[];
  try {
    decoded = rawSegments.map((segment) => decodeURIComponent(segment));
  } catch {
    throw new SkillError("invalid_path", "invalid percent-encoding");
  }
  const name = decoded[0];
  if (name === undefined || name.length === 0) {
    throw new SkillError("invalid_path", `unsupported uri: ${uri}`);
  }
  const file = decoded.length === 1 ? "SKILL.md" : decoded.slice(1).join("/");
  return { name, file: normalizeSkillFilePath(file) };
}

export function summarizeSkill(skill: RegistrySkill): SkillSummary {
  return {
    name: skill.name,
    version: skill.version,
    description: skill.description,
    roles: skill.roles,
    hosts: skill.hosts,
    tags: skill.tags,
    files: skill.files.map((file) => file.path),
    ...(skill.minimumWarpmetalCli !== undefined
      ? { minimumWarpmetalCli: skill.minimumWarpmetalCli }
      : {}),
  };
}

export function findSkill(loaded: LoadedRegistry, name: string): RegistrySkill {
  const skill = loaded.registry.skills.find((entry) => entry.name === name);
  if (skill === undefined) {
    const available = loaded.registry.skills.map((entry) => entry.name).join(", ");
    throw new SkillError("not_found", `unknown skill: ${name}${available ? ` (available: ${available})` : ""}`);
  }
  return skill;
}

export function listSkills(
  loaded: LoadedRegistry,
  filters: { role?: string; host?: string } = {},
): SkillSummary[] {
  return loaded.registry.skills
    .filter((skill) => (filters.role ? skill.roles.includes(filters.role) : true))
    .filter((skill) => (filters.host ? skill.hosts.includes(filters.host) : true))
    .map(summarizeSkill);
}

function scoreSkill(skill: RegistrySkill, query: string): number {
  const normalized = query.toLowerCase();
  const name = skill.name.toLowerCase();
  let score = 0;
  if (name === normalized) score += 100;
  else if (name.includes(normalized)) score += 60;
  for (const tag of skill.tags) {
    const value = tag.toLowerCase();
    if (value === normalized) score += 40;
    else if (value.includes(normalized)) score += 15;
  }
  if (skill.description.toLowerCase().includes(normalized)) score += 20;
  if (skill.roles.some((role) => role.toLowerCase() === normalized)) score += 10;
  if (skill.hosts.some((host) => host.toLowerCase() === normalized)) score += 10;
  return score;
}

export function searchSkills(
  loaded: LoadedRegistry,
  query: string,
  options: { limit?: number; role?: string; host?: string } = {},
): SearchHit[] {
  const limit = options.limit ?? 10;
  return loaded.registry.skills
    .filter((skill) => (options.role ? skill.roles.includes(options.role) : true))
    .filter((skill) => (options.host ? skill.hosts.includes(options.host) : true))
    .map((skill) => ({ skill, score: scoreSkill(skill, query) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.skill.name.localeCompare(right.skill.name))
    .slice(0, limit)
    .map(({ skill, score }) => ({
      name: skill.name,
      version: skill.version,
      description: skill.description,
      tags: skill.tags,
      score,
    }));
}

function mimeTypeFor(file: string): string {
  return file.endsWith(".md") ? "text/markdown" : "text/plain";
}

function verifyBytes(skill: RegistrySkill, file: string, bytes: Uint8Array, expected: string): void {
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new SkillError("too_large", `${skill.name}/${file} exceeds the ${MAX_FILE_BYTES} byte limit`);
  }
  const digest = sha256Hex(bytes);
  if (digest !== expected) {
    throw new SkillError("integrity_mismatch", `checksum mismatch for ${skill.name}/${file}`);
  }
}

export async function readSkillFile(
  loaded: LoadedRegistry,
  name: string,
  file = "SKILL.md",
): Promise<SkillFileContent> {
  const skill = findSkill(loaded, name);
  const normalized = normalizeSkillFilePath(file);
  const entry = skill.files.find((candidate) => candidate.path === normalized);
  if (entry === undefined) {
    throw new SkillError("not_found", `skill ${name} has no listed file: ${normalized}`);
  }

  if (loaded.rootDir !== null) {
    const path = join(loaded.rootDir, skill.path, ...normalized.split("/"));
    let bytes: Buffer;
    try {
      bytes = await readFile(path);
    } catch {
      throw new SkillError("not_found", `file is missing on disk: ${name}/${normalized}`);
    }
    verifyBytes(skill, normalized, bytes, entry.sha256);
    return {
      skill,
      file: normalized,
      text: bytes.toString("utf8"),
      mimeType: mimeTypeFor(normalized),
      sha256: entry.sha256,
    };
  }

  if (loaded.baseUrl !== null) {
    const url = `${loaded.baseUrl}${skill.path}/${normalized}`;
    let bytes: Buffer;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (error instanceof SkillError) throw error;
      throw new SkillError(
        "registry_unavailable",
        `could not fetch ${url}: ${(error as Error).message}`,
      );
    }
    verifyBytes(skill, normalized, bytes, entry.sha256);
    return {
      skill,
      file: normalized,
      text: bytes.toString("utf8"),
      mimeType: mimeTypeFor(normalized),
      sha256: entry.sha256,
    };
  }

  throw new SkillError("registry_unavailable", "registry has no file source");
}
