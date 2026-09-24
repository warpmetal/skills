#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { helpText, parseArguments } from "./cli.js";
import { errorMessage } from "./errors.js";
import { startHttpServer } from "./http.js";
import { loadRegistry } from "./registry.js";
import { SERVER_NAME, createSkillsServer } from "./server.js";
import { packageVersion } from "./version.js";

function banner(loadedSource: string, registryVersion: string, stale: boolean): string {
  return `${loadedSource}${stale ? ", stale" : ""}, registry ${registryVersion}`;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));

  if (options.help) {
    process.stdout.write(helpText());
    return;
  }
  if (options.version) {
    process.stdout.write(`${packageVersion()}\n`);
    return;
  }

  const loaded = await loadRegistry({
    registry: options.registry,
    tag: options.tag,
    cacheDir: options.cacheDir,
    offline: options.offline,
  });

  if (options.http) {
    // HTTP is unauthenticated, so it only ever gets the `content` profile: the
    // skill tools and resources, never the CLI surface.
    const running = await startHttpServer(loaded, { host: options.host, port: options.port });
    process.stderr.write(
      `${SERVER_NAME} ${packageVersion()} listening on http://${running.host}:${running.port} (profile content, ${banner(loaded.source, loaded.registry.registryVersion, loaded.stale)})\n`,
    );
    const shutdown = () => {
      void running.close().finally(() => process.exit(0));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    return;
  }

  // stdio is a local, operator-controlled channel, so it gets everything.
  const server = createSkillsServer(loaded, { profile: "full" });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `${SERVER_NAME} ${packageVersion()} ready (profile full, ${banner(loaded.source, loaded.registry.registryVersion, loaded.stale)})\n`,
  );
  const shutdown = () => {
    void server.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  process.stderr.write(`${SERVER_NAME}: ${errorMessage(error)}\n`);
  process.exit(1);
});
