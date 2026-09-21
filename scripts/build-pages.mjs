import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { jsonText, registryVersion } from "./lib/build.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const tag = registryVersion();
const publicDir = join(root, "public");

await rm(publicDir, { recursive: true, force: true });

for (const base of [tag, "latest"]) {
  const target = join(publicDir, base);
  await mkdir(target, { recursive: true });
  await cp(join(root, "catalog"), target, { recursive: true });
  await cp(join(root, "registry.json"), join(target, "registry.json"));
  await cp(join(root, "registry.schema.json"), join(target, "registry.schema.json"));
}

await writeFile(
  join(publicDir, "index.json"),
  jsonText({ latest: tag, versions: [tag], catalog: `${tag}/index.json` }),
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
      <li><a href="./${tag}/index.json">OpenCode catalog (${tag})</a></li>
    </ul>
  </body>
</html>
`,
  "utf8",
);

console.log(`pages: built public/${tag} and public/latest`);
