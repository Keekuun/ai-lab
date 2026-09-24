import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpTool } from "./mcp-tool.js";
import { createPersistentLedger } from "./persistent-ledger.js";
import { createCircuitBreaker, runTool, type AuditEvent, type Ledger } from "./run-tool.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const audit: AuditEvent[] = [];
// 设 LEDGER_PATH 用落盘账本（重启后重放仍命中）；默认进程内 Map
const ledger: Ledger = process.env.LEDGER_PATH
  ? createPersistentLedger(process.env.LEDGER_PATH)
  : new Map();
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

// 熔断：连续失败 2 次后打开，第三次调用不再执行 handler
const breaker = createCircuitBreaker({ failureThreshold: 2, cooldownMs: 60_000 });
let downCalls = 0;
const downTool = {
  name: "always_down",
  risk: "read" as const,
  maxRetries: 1,
  execute: async (): Promise<string> => {
    downCalls += 1;
    throw new Error("service down");
  },
};
await runTool({ requestId: "demo-cb-1", tool: downTool, args: {}, audit, circuitBreaker: breaker });
await runTool({ requestId: "demo-cb-2", tool: downTool, args: {}, audit, circuitBreaker: breaker });
const circuitOpen = await runTool({
  requestId: "demo-cb-3",
  tool: downTool,
  args: {},
  audit,
  circuitBreaker: breaker,
});

console.error("超时、重试、审批、幂等账本、熔断。MCP Tool 也走同一套 runTool。");
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
      circuitOpen,
      downCalls,
      audit,
    },
    null,
    2,
  ),
);
