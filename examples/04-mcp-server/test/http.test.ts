import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it } from "vitest";
import { startHttpMcpServer } from "../src/http-server.js";

const closers: Array<() => Promise<void>> = [];

const AUTH_TOKENS = {
  reader: "lab-reader-token",
  writer: "lab-writer-token",
};

const INITIALIZE_BODY = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "ai-lab-04-http-auth-test", version: "0.1.0" },
  },
};

afterEach(async () => {
  for (const close of closers.splice(0).reverse()) {
    await close();
  }
});

async function connectHttp(
  role: "reader" | "writer",
  options?: { tokens?: typeof AUTH_TOKENS; bearer?: string },
): Promise<{ client: Client; url: URL; transport: StreamableHTTPClientTransport }> {
  const started = await startHttpMcpServer({
    role: options?.tokens ? undefined : role,
    tokens: options?.tokens,
    host: "127.0.0.1",
    port: 0,
  });
  closers.push(started.close);
  const client = new Client({ name: "ai-lab-04-http-test", version: "0.1.0" });
  const headers: Record<string, string> = {};
  if (options?.bearer) {
    headers.Authorization = `Bearer ${options.bearer}`;
  }
  const transport = new StreamableHTTPClientTransport(started.url, {
    requestInit: { headers },
  });
  await client.connect(transport);
  closers.push(async () => {
    await client.close();
  });
  return { client, url: started.url, transport };
}

describe("HTTP MCP server", () => {
  it("writer 经 HTTP listTools 能看到读写能力", async () => {
    const { client } = await connectHttp("writer");
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(["publish_post", "search_blog"]);
  });

  it("reader 经 HTTP 只能发现只读能力，并能 callTool", async () => {
    const { client } = await connectHttp("reader");
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(["search_blog"]);

    const result = await client.callTool({
      name: "search_blog",
      arguments: { query: "http" },
    });
    expect(result.isError).toBeFalsy();
    const text = Array.isArray(result.content)
      ? result.content.map((part) => ("text" in part ? part.text : "")).join("")
      : "";
    expect(text).toContain("http");
  });
});

describe("HTTP MCP Bearer 鉴权", () => {
  it("配置了 token 时，没有 Authorization 返回 401", async () => {
    const started = await startHttpMcpServer({
      tokens: AUTH_TOKENS,
      host: "127.0.0.1",
      port: 0,
    });
    closers.push(started.close);

    const response = await fetch(started.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(INITIALIZE_BODY),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toMatch(/Bearer/i);
  });

  it("reader token 只能发现只读能力，writer token 能看到写入能力", async () => {
    const reader = await connectHttp("reader", {
      tokens: AUTH_TOKENS,
      bearer: AUTH_TOKENS.reader,
    });
    const readerTools = await reader.client.listTools();
    expect(readerTools.tools.map((tool) => tool.name)).toEqual(["search_blog"]);

    const writer = await connectHttp("writer", {
      tokens: AUTH_TOKENS,
      bearer: AUTH_TOKENS.writer,
    });
    const writerTools = await writer.client.listTools();
    expect(writerTools.tools.map((tool) => tool.name).sort()).toEqual(["publish_post", "search_blog"]);
  });

  it("已建立的会话缺少 token 不能继续调用", async () => {
    const { url, transport } = await connectHttp("writer", {
      tokens: AUTH_TOKENS,
      bearer: AUTH_TOKENS.writer,
    });
    expect(transport.sessionId).toBeTruthy();

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-session-id": transport.sessionId ?? "",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });

    expect(response.status).toBe(401);
  });
});
