import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMcpTool } from "../src/mcp-tool.js";
import { runTool, type AuditEvent } from "../src/run-tool.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function connectMcp(register: (server: McpServer) => void): Promise<Client> {
  const server = new McpServer({ name: "ai-lab-03-test", version: "0.1.0" });
  register(server);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "ai-lab-03-client", version: "0.1.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

describe("createMcpTool + runTool", () => {
  it("成功调用 MCP Tool 并走同一套审计", async () => {
    const client = await connectMcp((server) => {
      server.registerTool(
        "search_blog",
        {
          description: "检索",
          inputSchema: z.object({ query: z.string() }),
        },
        async ({ query }) => ({
          content: [{ type: "text", text: JSON.stringify({ hits: [query] }) }],
        }),
      );
    });
    const audit: AuditEvent[] = [];

    const result = await runTool({
      requestId: "mcp-ok",
      tool: createMcpTool({
        client,
        name: "search_blog",
        risk: "read",
      }),
      args: { query: "LCEL" },
      audit,
    });

    expect(result).toEqual({ ok: true, data: { hits: ["LCEL"] } });
    expect(audit.some((event) => event.outcome === "ok")).toBe(true);
    await client.close();
  });

  it("高风险 MCP Tool 未审批时不会发到 Server", async () => {
    let calls = 0;
    const client = await connectMcp((server) => {
      server.registerTool(
        "charge",
        {
          description: "扣款",
          inputSchema: z.object({ orderId: z.string() }),
        },
        async () => {
          calls += 1;
          return { content: [{ type: "text", text: "{\"charged\":1}" }] };
        },
      );
    });

    const result = await runTool({
      requestId: "mcp-deny",
      tool: createMcpTool({
        client,
        name: "charge",
        risk: "high",
      }),
      args: { orderId: "o-1" },
      approved: false,
      audit: [],
    });

    expect(result).toMatchObject({ ok: false, reason: "needs_approval" });
    expect(calls).toBe(0);
    await client.close();
  });

  it("MCP Tool 超时后失败", async () => {
    const client = await connectMcp((server) => {
      server.registerTool(
        "slow_search",
        {
          description: "慢检索",
          inputSchema: z.object({ q: z.string() }),
        },
        async () => {
          await sleep(80);
          return { content: [{ type: "text", text: "late" }] };
        },
      );
    });

    const result = await runTool({
      requestId: "mcp-timeout",
      tool: createMcpTool({
        client,
        name: "slow_search",
        risk: "read",
        timeoutMs: 20,
      }),
      args: { q: "blog" },
      audit: [],
    });

    expect(result).toMatchObject({ ok: false, reason: "timeout" });
    await client.close();
  });
});
