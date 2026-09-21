import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildRegistryModel, jsonText, registryVersion } from "./lib/build.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const tag = registryVersion();
const publicDir = join(root, "public");
const siteUrl = (process.env.WARPMETAL_SKILLS_SITE_URL ?? "https://skills.warpmetal.com").replace(
  /\/+$/,
  "",
);

/**
 * Release history accumulates across tags. The release workflow fetches the
 * previously deployed file and prepends the current release; an unreachable or
 * missing history starts a new one (first release, local builds, air-gapped CI).
 */
async function loadPreviousReleases() {
  try {
    const response = await fetch(`${siteUrl}/releases.json`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return [];
    const parsed = await response.json();
    return Array.isArray(parsed?.releases) ? parsed.releases : [];
  } catch {
    return [];
  }
}

await rm(publicDir, { recursive: true, force: true });

for (const base of [tag, "latest"]) {
  const target = join(publicDir, base);
  await mkdir(target, { recursive: true });
  await cp(join(root, "catalog"), target, { recursive: true });
  await cp(join(root, "registry.json"), join(target, "registry.json"));
  await cp(join(root, "registry.schema.json"), join(target, "registry.schema.json"));
}

const model = await buildRegistryModel({ root });
const previous = await loadPreviousReleases();
const releases = [
  {
    version: tag,
    releasedAt: new Date().toISOString(),
    skills: Object.fromEntries(model.skills.map((skill) => [skill.name, skill.version])),
  },
  ...previous.filter((release) => release?.version !== tag),
];

await writeFile(
  join(publicDir, "releases.json"),
  jsonText({ schemaVersion: 1, latest: tag, releases }),
  "utf8",
);

await writeFile(
  join(publicDir, "index.json"),
  jsonText({ latest: tag, versions: releases.map((release) => release.version) }),
  "utf8",
);

await writeFile(
  join(publicDir, "index.html"),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>WarpMetal Skills</title>
  </head>
  <body>
    <h1>WarpMetal Skills</h1>
    <p>Immutable per tag. Current release: <strong>${tag}</strong>.</p>
    <ul>
      <li><a href="./latest/index.json">OpenCode catalog (latest)</a></li>
      <li><a href="./latest/registry.json">Registry manifest (latest)</a></li>
      <li><a href="./latest/registry.schema.json">Registry schema (latest)</a></li>
      <li><a href="./releases.json">Release history</a></li>
      <li><a href="./${tag}/index.json">OpenCode catalog (${tag})</a></li>
    </ul>
  </body>
</html>
`,
  "utf8",
);

console.log(
  `pages: built public/${tag}, public/latest, and releases.json (${releases.length} release(s))`,
);
