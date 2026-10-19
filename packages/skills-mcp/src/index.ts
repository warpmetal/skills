#!/usr/bin/env node
import { readFile } from "node:fs/promises";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { helpText, parseArguments } from "./cli.js";
import { SkillError, errorMessage } from "./errors.js";
import { startHttpServer } from "./http.js";
import { loadRegistry } from "./registry.js";
import { SERVER_NAME, createSkillsServer } from "./server.js";
import { createProviderInvokerFromEnv } from "./providers/index.js";
import { packageVersion } from "./version.js";

function banner(loadedSource: string, registryVersion: string, stale: boolean): string {
  return `${loadedSource}${stale ? ", stale" : ""}, registry ${registryVersion}`;
}

/**
 * `--registry-token-file` exists so hosts that scrub `*TOKEN*` environment
 * variables can still pass a credential without putting it in the process list
 * or the environment.
 */
async function readTokenFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    throw new SkillError(
      "invalid_request",
      `--registry-token-file: cannot read ${path}: ${(error as Error).message}`,
    );
  }
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

  const registryToken = options.registryTokenFile
    ? await readTokenFile(options.registryTokenFile)
    : undefined;

  const loaded = await loadRegistry({
    registry: options.registry,
    tag: options.tag,
    cacheDir: options.cacheDir,
    offline: options.offline,
    noFallback: options.noFallback,
    registryToken,
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
  const providers = createProviderInvokerFromEnv();
  if (!providers.configured) {
    // The tools still register, but every call answers `provider_unconfigured`.
    // Say so once, loudly, instead of leaving it to the first failed call.
    process.stderr.write(
      `${SERVER_NAME}: provider tools are enabled but @warpmetal/cli could not be resolved; each provider tools/call will answer provider_unconfigured. Install it with \`npm i @warpmetal/cli\` or set WARPMETAL_INTEGRATION_CLI_JS to its entry file.\n`,
    );
  }
  const server = createSkillsServer(loaded, { profile: "full", providers });
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
