import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createBlogCapabilities } from "./blog-capabilities.js";
import { resolveBearerRole, type HttpAuthTokens } from "./http-auth.js";
import { connectCapabilityOverMcp } from "./mcp-adapter.js";
import type { ActorRole } from "./server.js";

const MCP_PATH = "/mcp";
const DEFAULT_HOST = "127.0.0.1";
const WWW_AUTHENTICATE = 'Bearer realm="mcp"';

type HttpSession = {
  role: ActorRole;
  transport: StreamableHTTPServerTransport;
};

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function isInitializePayload(body: unknown): boolean {
  const messages = Array.isArray(body) ? body : [body];
  return messages.some(
    (message) =>
      message !== null &&
      typeof message === "object" &&
      "method" in message &&
      (message as { method?: unknown }).method === "initialize",
  );
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return undefined;
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function writeJsonRpcError(
  response: ServerResponse,
  status: number,
  code: number,
  message: string,
  headers?: Record<string, string>,
): void {
  response
    .writeHead(status, { "content-type": "application/json", ...headers })
    .end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code, message },
        id: null,
      }),
    );
}

function writeUnauthorized(response: ServerResponse): void {
  writeJsonRpcError(response, 401, -32001, "Unauthorized", {
    "www-authenticate": WWW_AUTHENTICATE,
  });
}

export async function startHttpMcpServer(options: {
  role?: ActorRole;
  tokens?: HttpAuthTokens;
  host?: string;
  port?: number;
  storePath?: string;
}): Promise<{ url: URL; close: () => Promise<void> }> {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? 0;
  assert(port >= 0, "port 必须 >= 0");
  assert(options.tokens !== undefined || options.role !== undefined, "需要 role 或 tokens");
  if (options.tokens) {
    assert(options.tokens.reader.length > 0, "reader token 不能为空");
    assert(options.tokens.writer.length > 0, "writer token 不能为空");
    assert(options.tokens.reader !== options.tokens.writer, "reader 和 writer token 不能相同");
  }

  const capabilities = createBlogCapabilities({
    storePath: options.storePath,
    onAudit: (event) => {
      console.error(`audit ${JSON.stringify(event)}`);
    },
  });
  const sessions = new Map<string, HttpSession>();

  const httpServer = createServer((request, response) => {
    const path = request.url?.split("?")[0];
    if (path !== MCP_PATH) {
      response.writeHead(404).end("not found");
      return;
    }

    void handleMcpRequest(request, response).catch((error: unknown) => {
      if (!response.headersSent) {
        response.writeHead(500).end(error instanceof Error ? error.message : String(error));
      }
    });
  });

  function authenticate(request: IncomingMessage): ActorRole | null {
    if (!options.tokens) {
      return options.role ?? null;
    }
    return resolveBearerRole(headerValue(request.headers.authorization), options.tokens);
  }

  async function handleMcpRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const role = authenticate(request);
    if (role === null) {
      writeUnauthorized(response);
      return;
    }

    const sessionId = headerValue(request.headers["mcp-session-id"]);
    const existing = sessionId ? sessions.get(sessionId) : undefined;

    if (existing) {
      if (existing.role !== role) {
        writeUnauthorized(response);
        return;
      }
      await existing.transport.handleRequest(request, response);
      return;
    }

    if (sessionId) {
      writeJsonRpcError(response, 404, -32001, "Session not found");
      return;
    }

    if (request.method !== "POST") {
      writeJsonRpcError(response, 400, -32000, "Bad Request: missing mcp-session-id");
      return;
    }

    let parsedBody: unknown;
    try {
      parsedBody = await readJsonBody(request);
    } catch {
      writeJsonRpcError(response, 400, -32700, "Parse error: Invalid JSON");
      return;
    }

    if (!isInitializePayload(parsedBody)) {
      writeJsonRpcError(response, 400, -32000, "Bad Request: expected initialize");
      return;
    }

    const mcpServer = connectCapabilityOverMcp(capabilities, { role });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (id) => {
        sessions.set(id, { role, transport });
      },
      onsessionclosed: (id) => {
        sessions.delete(id);
      },
    });
    await mcpServer.connect(transport);
    await transport.handleRequest(request, response, parsedBody);
  }

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, () => {
      resolve();
    });
  });

  const address = httpServer.address();
  assert(address !== null && typeof address === "object", "HTTP 服务没有绑定到端口");
  const url = new URL(`http://${host}:${address.port}${MCP_PATH}`);

  return {
    url,
    close: async () => {
      await Promise.all(
        [...sessions.values()].map(async (session) => {
          await session.transport.close();
        }),
      );
      sessions.clear();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}
