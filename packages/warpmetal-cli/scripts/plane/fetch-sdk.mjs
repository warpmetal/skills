#!/usr/bin/env node
/**
 * Pins the Python SDK the pinned Plane MCP server calls, and holds it still.
 *
 * `inventory.json` records, for every action the vendor's MCP server declares, the
 * client member it calls (`sdkCalls`) - but not the request that member makes. The
 * verb and the path live one layer down, in Plane's own Python SDK, which the
 * pinned MCP release pins in its own `pyproject.toml` (`plane-sdk==0.3.1`). Plane
 * publishes no OpenAPI document, so that source is the only statement of the
 * request there is, and every entry in `endpoints.mjs` was reviewed against it.
 *
 * Until now that claim rested on a comment: nothing checked it. This script makes
 * it checkable. It downloads that release's sdist from PyPI, checks the bytes
 * against the digest PyPI publishes for them, and records a sha256 for every
 * module of the `plane` package:
 *
 *     node fetch-sdk.mjs --update    # pin (or re-pin) the SDK release
 *     node fetch-sdk.mjs --check     # prove the pin still holds
 *
 * The sdist digest is the pin: PyPI does not rewrite a published release, so a
 * matching digest is the same bytes the review was made against. The per-file
 * digests are what make drift legible - they say *which* module moved, so a
 * re-pin can be read as a diff rather than re-reviewed from nothing.
 *
 * `--check` re-derives the file list and compares it against the committed
 * `sdk.json`, so an edited `sdk.json` fails as loudly as one whose upstream moved.
 * It reads the cached tarball when one is present, and downloads it otherwise -
 * add `--offline` to refuse the network. This script decides nothing about our
 * surface; it only says what the SDK the vendor pins actually contains.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const SDK_FILE = join(HERE, "sdk.json");

/** The release this pin is held to. Moving it is a reviewed change. */
export const PACKAGE = "plane-sdk";
export const VERSION = "0.3.1";
const PYPI_JSON = `https://pypi.org/pypi/${PACKAGE}/${VERSION}/json`;
const CACHE_ROOT = join(HERE, ".cache", `${PACKAGE}-${VERSION}`);
const ARTIFACT = `${PACKAGE.replace("-", "_")}-${VERSION}.tar.gz`;
const TARBALL = join(CACHE_ROOT, ARTIFACT);

/** The directory the sdist unpacks into, and the package inside it. */
const SDIST_ROOT = `${PACKAGE.replace("-", "_")}-${VERSION}/`;
const PACKAGE_ROOT = `${SDIST_ROOT}plane/`;

/**
 * Fields `--update` writes but `--check` does not compare.
 *
 * `uploadTime` comes from the release API, which a cache-only check cannot reach;
 * comparing it would make an offline check fail for a reason that has nothing to do
 * with the pin.
 */
const RELEASE_METADATA = ["uploadTime"];

/** The digest, as the one string that has to match PyPI's record for the pin. */
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function parseArgs(argv) {
  const args = { update: false, check: false, offline: false };
  for (const arg of argv) {
    if (arg === "--update") args.update = true;
    else if (arg === "--check") args.check = true;
    else if (arg === "--offline") args.offline = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!args.update && !args.check) args.check = true;
  if (args.update && args.check) args.check = false;
  return args;
}

/** A NUL- or space-terminated field of a tar header, as a string. */
function readField(header, offset, length) {
  const slice = header.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? slice.length : end).toString("utf8").trim();
}

/**
 * A tar header's size field, which is octal text - or GNU base-256, which no sdist
 * this repository pins has ever used. Base-256 is refused rather than guessed at,
 * because a wrong size would desynchronise every member after it.
 */
function readSize(header, path) {
  if ((header[124] & 0x80) !== 0) throw new Error(`${path}: base-256 size field is not supported`);
  const text = readField(header, 124, 12);
  if (text === "") return 0;
  if (!/^[0-7]+$/.test(text)) throw new Error(`${path}: size field "${text}" is not octal`);
  return Number.parseInt(text, 8);
}

/** A `key=value` record of a pax extended header, or null when it carries no such key. */
function paxRecord(payload, key) {
  const pattern = new RegExp(`^\\d+ ${key}=(.*)$`);
  for (const line of payload.toString("utf8").split("\n")) {
    const match = pattern.exec(line);
    if (match !== null) return match[1];
  }
  return null;
}

/**
 * Reads a `.tar.gz` into memory, keyed by member path.
 *
 * Only regular files and directories are understood, which is the whole of what a
 * Python sdist holds. A link would be refused rather than skipped: a member this
 * reader cannot read is a member no review has seen.
 */
export function readTarGz(bytes) {
  const tar = gunzipSync(bytes);
  const files = new Map();
  let offset = 0;
  let extendedPath = null;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    offset += 512;
    if (header.every((byte) => byte === 0)) break;
    const name = readField(header, 0, 100);
    const prefix = readField(header, 345, 155);
    const typeflag = String.fromCharCode(header[156] || 0x30);
    const size = readSize(header, name);
    const payload = tar.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;
    if (typeflag === "g") continue;
    if (typeflag === "x") {
      if (paxRecord(payload, "size") !== null) {
        throw new Error(`${name}: a pax size record is not supported; the member sizes cannot be trusted`);
      }
      // A pax header stands *before* the member it describes, so its `path=` is held for
      // the next entry. Python's writer emits one before every member but records only a
      // timestamp in it, so the entry's own name is usually the path either way - which is
      // why the fallback is null here and not this header's name, `././@PaxHeader`.
      extendedPath = paxRecord(payload, "path");
      continue;
    }
    const path = extendedPath ?? (prefix === "" ? name : `${prefix}/${name}`);
    extendedPath = null;
    if (typeflag === "5") continue;
    if (typeflag !== "0") throw new Error(`${path}: unsupported tar entry type "${typeflag}"`);
    files.set(path, Buffer.from(payload));
  }
  return files;
}

/**
 * The files of the pinned release that belong to the `plane` package, keyed by path
 * relative to the sdist root - `plane/api/pages.py`, the form `sdk.json` records.
 */
export function packageFiles(members) {
  const kept = new Map();
  for (const [path, bytes] of members) {
    if (path.startsWith(PACKAGE_ROOT)) kept.set(path.slice(SDIST_ROOT.length), bytes);
  }
  if (kept.size === 0) {
    throw new Error(`the sdist holds no files under ${PACKAGE_ROOT}; the pin is not readable`);
  }
  return kept;
}

/**
 * The pinned package's modules as text, keyed by sdist-relative path, for readers
 * that need the source itself (`sdk-index.mjs`).
 *
 * It reads the cache and never the network: a checkout without the tarball says so,
 * naming the command that fetches it, instead of a unit test quietly downloading.
 */
export function readPinnedSdk() {
  if (!existsSync(TARBALL)) {
    throw new Error(`${TARBALL} is not cached; run: node scripts/plane/fetch-sdk.mjs --update`);
  }
  const bytes = readFileSync(TARBALL);
  const source = existsSync(SDK_FILE) ? JSON.parse(readFileSync(SDK_FILE, "utf8")).source : null;
  if (source !== null && source.sha256 !== sha256(bytes)) {
    throw new Error(`the cached ${ARTIFACT} is not the pinned one; run: node scripts/plane/fetch-sdk.mjs --check`);
  }
  const files = new Map();
  for (const [path, content] of packageFiles(readTarGz(bytes))) files.set(path, content.toString("utf8"));
  return { files, source };
}

/** The release record PyPI publishes: the digest that pins the bytes, and metadata. */
async function fetchRelease() {
  const response = await fetch(PYPI_JSON, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`PyPI answered ${response.status} for ${PYPI_JSON}`);
  const release = await response.json();
  const sdist = (release.urls ?? []).find((file) => file.packagetype === "sdist");
  if (sdist === undefined) throw new Error(`${PACKAGE} ${VERSION} publishes no sdist`);
  const published = sdist.digests?.sha256 ?? "";
  if (!/^[0-9a-f]{64}$/.test(published)) {
    throw new Error(`PyPI published no sha256 for ${sdist.filename}; there is no pin to hold it to`);
  }
  const artifact = await fetch(sdist.url);
  if (!artifact.ok) throw new Error(`PyPI answered ${artifact.status} for ${sdist.filename}`);
  return {
    filename: sdist.filename,
    digest: published,
    uploadTime: sdist.upload_time_iso_8601 ?? null,
    license: licenseOf(release.info),
    bytes: Buffer.from(await artifact.arrayBuffer()),
  };
}

/**
 * The pinned sdist: the cached copy when there is one - checked against the committed
 * pin - and otherwise the published one, whose served bytes must carry the digest
 * PyPI publishes for them. A cache that disagrees with the pin is not reused, so a
 * stale cache cannot pass a check by being the thing it is compared against.
 */
async function readArtifact({ offline, expectedSha256, refresh = false }) {
  if (!refresh && existsSync(TARBALL)) {
    const bytes = readFileSync(TARBALL);
    const digest = sha256(bytes);
    if (expectedSha256 === undefined || digest === expectedSha256) return { bytes, release: null };
    if (offline) {
      throw new Error(
        `${TARBALL} has digest ${digest}, not the pinned ${expectedSha256}; ` +
          `delete ${CACHE_ROOT} and re-run without --offline to re-download it`,
      );
    }
  } else if (offline) {
    throw new Error(`${TARBALL} is not cached, and --offline refuses to download it`);
  }
  const release = await fetchRelease();
  const served = sha256(release.bytes);
  if (served !== release.digest) {
    throw new Error(
      `PyPI served ${release.filename} with digest ${served}, not the published ${release.digest}`,
    );
  }
  mkdirSync(CACHE_ROOT, { recursive: true });
  writeFileSync(TARBALL, release.bytes);
  return { bytes: release.bytes, release };
}

/**
 * The release's license, as PyPI states it.
 *
 * Newer metadata states it as a PEP 639 expression in `license_expression` and leaves
 * `license` null or holding the whole license text; older metadata does the reverse. The
 * classifier is the last resort, so a pin records a license name rather than a null for
 * a release that publishes one.
 */
function licenseOf(info) {
  const expression = typeof info?.license_expression === "string" ? info.license_expression.trim() : "";
  if (expression !== "") return expression;
  const stated = typeof info?.license === "string" ? info.license.trim() : "";
  if (stated !== "" && stated.length <= 64 && !stated.includes("\n")) return stated;
  const classifier = (info?.classifiers ?? []).find((entry) => entry.startsWith("License ::"));
  return classifier === undefined ? null : classifier.split("::").pop().trim();
}

/** One record per module of the pinned package, sorted by path. */
function deriveFiles(bytes) {
  const records = [];
  for (const [path, content] of packageFiles(readTarGz(bytes))) {
    records.push({ path, sha256: sha256(content), bytes: content.length });
  }
  return records.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

function buildSdk(files, bytes, metadata) {
  return {
    note: "Auto-generated by scripts/plane/fetch-sdk.mjs - do not edit by hand.",
    source: {
      package: PACKAGE,
      version: VERSION,
      license: metadata.license ?? null,
      artifact: metadata.filename ?? ARTIFACT,
      sha256: sha256(bytes),
      bytes: bytes.length,
      uploadTime: metadata.uploadTime ?? null,
      publisher: PYPI_JSON,
    },
    counts: { files: files.length, bytes: files.reduce((total, file) => total + file.bytes, 0) },
    files,
  };
}

/** The pin as `--check` compares it: release metadata the cache cannot vouch for removed. */
export function comparable(sdk) {
  const copy = JSON.parse(JSON.stringify(sdk));
  for (const field of RELEASE_METADATA) delete copy.source[field];
  return copy;
}

/** The first field two derivations disagree on, as a path, or null when they agree. */
export function firstDifference(left, right, path = "sdk") {
  if (JSON.stringify(left) === JSON.stringify(right)) return null;
  const scalar = (value) => value === null || typeof value !== "object";
  if (scalar(left) || scalar(right)) return `${path}: ${JSON.stringify(left)} != ${JSON.stringify(right)}`;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return `${path}: an array against a non-array`;
    if (left.length !== right.length) return `${path}.length: ${left.length} != ${right.length}`;
    for (let index = 0; index < left.length; index += 1) {
      const difference = firstDifference(left[index], right[index], `${path}[${index}]`);
      if (difference !== null) return difference;
    }
    return `${path}: differs`;
  }
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  for (const key of keys) {
    const difference = firstDifference(left[key], right[key], `${path}.${key}`);
    if (difference !== null) return difference;
  }
  return `${path}: differs`;
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`usage: node fetch-sdk.mjs [--update | --check] [--offline]

  --update   pin (or re-pin) ${PACKAGE} ${VERSION} from PyPI
  --check    prove the committed sdk.json still holds (default)
  --offline  refuse the network, reading the cached tarball only`);
    return;
  }
  const committed = existsSync(SDK_FILE) ? JSON.parse(readFileSync(SDK_FILE, "utf8")) : null;
  const { bytes, release } = await readArtifact({
    offline: args.offline,
    expectedSha256: committed?.source?.sha256,
    // A cache hit returns no release metadata, so without this a re-pin would write
    // `license: null` for a release whose license PyPI publishes. Only `--update` pays
    // for the round trip, and `--offline` still refuses the network.
    refresh: args.update && !args.offline,
  });
  const files = deriveFiles(bytes);
  const body = buildSdk(files, bytes, release ?? committed?.source ?? {});

  if (args.update) {
    writeFileSync(SDK_FILE, `${JSON.stringify(body, null, 2)}\n`);
    console.log(`wrote ${files.length} file digest(s) for ${PACKAGE} ${VERSION} to ${SDK_FILE}`);
    return;
  }
  if (committed === null) {
    console.error(`${SDK_FILE} does not exist; run: node fetch-sdk.mjs --update`);
    process.exitCode = 1;
    return;
  }
  const difference = firstDifference(comparable(body), comparable(committed));
  if (difference !== null) {
    console.error(`sdk.json is out of date: ${difference}`);
    console.error("re-run: node fetch-sdk.mjs --update, then review the diff");
    process.exitCode = 1;
    return;
  }
  console.log(`sdk.json matches the pinned release (${PACKAGE} ${VERSION}, ${files.length} file(s))`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
