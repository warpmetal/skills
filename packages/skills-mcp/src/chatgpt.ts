#!/usr/bin/env node
/**
 * chatgpt.ts - the ChatGPT desktop entrypoint, on the v2 server runtime.
 *
 * It serves the `chatgpt-local` surface over stdio: the three content tools and
 * the 43 `wm_*` specs, without the provider tools. The tool specs, the single
 * `handle()` path, the approval gate, the latch, the audit log and the executor
 * are the ones the v1 server uses; `chatgpt/register.ts` only adapts the
 * registration call to the v2 SDK, so behaviour cannot drift between the two.
 *
 * This entrypoint *is* the `chatgpt-local` profile: it does not take `--profile`,
 * and it never opens a socket.
 */
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { OpenAIExtensions } from "@openai/mcp-extensions/server";

import { helpText, parseArguments } from "./cli.js";
import { registerChatgptApp } from "./chatgpt/app.js";
import { registerChatgptForms } from "./chatgpt/forms.js";
import { registerChatgptMentions } from "./chatgpt/mentions.js";
import { registerChatgptSurface } from "./chatgpt/register.js";
import { SkillError, errorMessage } from "./errors.js";
import { loadRegistryForCli } from "./load.js";
import { SERVER_NAME, SERVER_VERSION, buildDeps } from "./server.js";
import { packageVersion } from "./version.js";

function banner(loadedSource: string, registryVersion: string, stale: boolean): string {
  return `${loadedSource}${stale ? ", stale" : ""}, registry ${registryVersion}`;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));

  if (options.help) {
    // This entrypoint is always `chatgpt-local`, so the shared help's
    // `--profile` line does not apply here; say what does.
    process.stdout.write(
      `${SERVER_NAME} chatgpt entrypoint (profile chatgpt-local, stdio only)\n\n`,
    );
    process.stdout.write(helpText());
    return;
  }
  if (options.version) {
    process.stdout.write(`${packageVersion()}\n`);
    return;
  }
  if (options.http) {
    throw new SkillError(
      "invalid_request",
      "chatgpt is stdio only; --http is not supported here",
    );
  }

  const loaded = await loadRegistryForCli(options);

  // One dependency set for the process: the approval store, the task registry
  // and the persisted latch are the same trust domain the v1 stdio server uses,
  // so a token minted on one connection cannot mean a different thing on another.
  const deps = buildDeps({});

  serveStdio(() => {
    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
    registerChatgptSurface(server, loaded, deps);
    registerChatgptApp(server, deps);
    // Constructing this advertises the OpenAI extension capabilities. Mentions
    // and the picker form are registered through it, before the transport is
    // attached.
    const openaiExtensions = new OpenAIExtensions(server);
    registerChatgptMentions(openaiExtensions, deps);
    registerChatgptForms(server, openaiExtensions, deps);
    return server;
  });

  process.stderr.write(
    `${SERVER_NAME} ${packageVersion()} ready (profile chatgpt-local, v2, ${banner(loaded.source, loaded.registry.registryVersion, loaded.stale)})\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${SERVER_NAME}: ${errorMessage(error)}\n`);
  process.exit(1);
});
