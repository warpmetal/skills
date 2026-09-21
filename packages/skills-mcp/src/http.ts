import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import type { LoadedRegistry } from "./registry.js";
import { createSkillsServer } from "./server.js";

export interface HttpServerOptions {
  host: string;
  port: number;
}

export interface RunningHttpServer {
  host: string;
  port: number;
  close(): Promise<void>;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const text = `${JSON.stringify(body)}\n`;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
  });
  response.end(text);
}

export async function startHttpServer(
  loaded: LoadedRegistry,
  options: HttpServerOptions,
): Promise<RunningHttpServer> {
  const server = createServer((request, response) => {
    void handleRequest(loaded, request, response);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : options.port;

  return {
    host: options.host,
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function handleRequest(
  loaded: LoadedRegistry,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname === "/healthz") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (url.pathname === "/readyz") {
    sendJson(response, 200, {
      status: "ok",
      registryVersion: loaded.registry.registryVersion,
      skills: loaded.registry.skills.length,
      source: loaded.source,
      stale: loaded.stale,
    });
    return;
  }

  if (url.pathname !== "/mcp") {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  // Stateless mode: a fresh server and transport per request, no session state.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const mcp = createSkillsServer(loaded);
  response.on("close", () => {
    void transport.close().catch(() => undefined);
    void mcp.close().catch(() => undefined);
  });

  try {
    await mcp.connect(transport);
    await transport.handleRequest(request, response);
  } catch (error) {
    if (!response.headersSent) {
      sendJson(response, 500, {
        error: "internal_error",
        message: error instanceof Error ? error.message : String(error),
      });
    } else {
      response.end();
    }
  }
}
