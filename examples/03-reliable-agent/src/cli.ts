import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpTool } from "./mcp-tool.js";
import { runTool, type AuditEvent, type Ledger } from "./run-tool.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const audit: AuditEvent[] = [];
const ledger: Ledger = new Map();
let charges = 0;

const timeoutResult = await runTool({
  requestId: "demo-timeout",
  tool: {
    name: "slow_search",
    risk: "read",
    timeoutMs: 20,
    execute: async () => {
      await sleep(80);
      return "late";
    },
  },
  args: {},
  audit,
});

let flakyCalls = 0;
const retryResult = await runTool({
  requestId: "demo-retry",
  tool: {
    name: "flaky_search",
    risk: "read",
    maxRetries: 3,
    execute: async () => {
      flakyCalls += 1;
      if (flakyCalls < 3) {
        throw new Error("upstream down");
      }
      return { hits: 1 };
    },
  },
  args: {},
  audit,
});

const denied = await runTool({
  requestId: "demo-deny",
  tool: {
    name: "charge",
    risk: "high",
    execute: async () => {
      charges += 1;
      return { charged: 99 };
    },
  },
  args: { orderId: "o-1" },
  approved: false,
  audit,
});

const charged = await runTool({
  requestId: "demo-charge",
  tool: {
    name: "charge",
    risk: "high",
    execute: async () => {
      charges += 1;
      return { charged: 99 };
    },
  },
  args: { orderId: "o-1" },
  approved: true,
  idempotencyKey: "pay-o-1",
  ledger,
  audit,
});

const replayed = await runTool({
  requestId: "demo-replay",
  tool: {
    name: "charge",
    risk: "high",
    execute: async () => {
      charges += 1;
      return { charged: 99 };
    },
  },
  args: { orderId: "o-1" },
  approved: true,
  idempotencyKey: "pay-o-1",
  ledger,
  audit,
});

const mcpServer = new McpServer({ name: "ai-lab-03-demo", version: "0.1.0" });
mcpServer.registerTool(
  "search_blog",
  {
    description: "检索",
    inputSchema: z.object({ query: z.string() }),
  },
  async ({ query }) => ({
    content: [{ type: "text", text: JSON.stringify({ hits: [query] }) }],
  }),
);
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const mcpClient = new Client({ name: "ai-lab-03-cli", version: "0.1.0" });
await mcpServer.connect(serverTransport);
await mcpClient.connect(clientTransport);
const mcpSearch = await runTool({
  requestId: "demo-mcp",
  tool: createMcpTool({
    client: mcpClient,
    name: "search_blog",
    risk: "read",
  }),
  args: { query: "LCEL" },
  audit,
});
await mcpClient.close();

console.error("超时、重试、审批、幂等账本。MCP Tool 也走同一套 runTool。");
console.log(
  JSON.stringify(
    {
      timeoutResult,
      retryResult,
      denied,
      charged,
      replayed,
      charges,
      mcpSearch,
      audit,
    },
    null,
    2,
  ),
);
