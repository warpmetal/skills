#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { helpText, parseArguments } from "./cli.js";
import { errorMessage } from "./errors.js";
import { startHttpServer } from "./http.js";
import { loadRegistryForCli } from "./load.js";
import { SERVER_NAME, createSkillsServer } from "./server.js";
import { createProviderInvokerFromEnv } from "./providers/index.js";
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

  const loaded = await loadRegistryForCli(options);

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

  // stdio is a local, operator-controlled channel, so `full` gets everything.
  // `chatgpt-local` rides the same channel without the provider tools, so its
  // invoker is never resolved here either: that profile must stay at 46 tools
  // whatever the host happens to have installed.
  const profile = options.profile;
  const providers = profile === "full" ? createProviderInvokerFromEnv() : null;
  if (providers !== null && !providers.configured) {
    // The tools still register, but every call answers `provider_unconfigured`.
    // Say so once, loudly, instead of leaving it to the first failed call.
    process.stderr.write(
      `${SERVER_NAME}: provider tools are enabled but @warpmetal/cli could not be resolved; each provider tools/call will answer provider_unconfigured. Install it with \`npm i @warpmetal/cli\` or set WARPMETAL_INTEGRATION_CLI_JS to its entry file.\n`,
    );
  }
  const server = createSkillsServer(loaded, { profile, providers });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `${SERVER_NAME} ${packageVersion()} ready (profile ${profile}, ${banner(loaded.source, loaded.registry.registryVersion, loaded.stale)})\n`,
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
