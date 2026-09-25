import { describe, expect, it } from "vitest";
import {
  createBudget,
  runTool,
  type AuditEvent,
  type Budget,
  type Ledger,
} from "../src/run-tool.js";

function createCountingTool(name: string, onCall: () => void) {
  return {
    name,
    risk: "read" as const,
    execute: async (): Promise<string> => {
      onCall();
      return "done";
    },
  };
}

async function runWithBudget(budget: Budget, requestId: string, audit: AuditEvent[]) {
  return runTool({
    requestId,
    tool: { name: "step", risk: "read", execute: () => Promise.resolve("ok") },
    args: {},
    audit,
    budget,
  });
}

describe("budget", () => {
  it("步数耗尽后拒绝执行，handler 不再运行", async () => {
    const budget = createBudget({ maxSteps: 2 });
    const audit: AuditEvent[] = [];

    await runWithBudget(budget, "req-1", audit);
    await runWithBudget(budget, "req-2", audit);
    let calls = 0;
    const third = await runTool({
      requestId: "req-3",
      tool: createCountingTool("counted", () => {
        calls += 1;
      }),
      args: {},
      audit,
      budget,
    });

    expect(third).toMatchObject({ ok: false, reason: "budget_exceeded" });
    expect(calls).toBe(0);
    expect(audit.some((event) => event.outcome === "budget_exceeded")).toBe(true);
  });

  it("成本累计超 maxCost 拒绝", async () => {
    const budget = createBudget({ maxSteps: 10, maxCost: 5 });
    const audit: AuditEvent[] = [];

    const expensive = {
      name: "expensive",
      risk: "read" as const,
      cost: 3,
      execute: () => Promise.resolve("ok"),
    };
    await runTool({ requestId: "req-1", tool: expensive, args: {}, audit, budget });
    const second = await runTool({
      requestId: "req-2",
      tool: expensive,
      args: {},
      audit,
      budget,
    });

    // 第一次花 3，第二次 3+3=6 超 5，拒绝
    expect(second).toMatchObject({ ok: false, reason: "budget_exceeded" });
  });

  it("幂等命中账本不耗预算", async () => {
    const budget = createBudget({ maxSteps: 1 });
    const ledger: Ledger = new Map();
    const audit: AuditEvent[] = [];
    const tool = {
      name: "charge",
      risk: "high" as const,
      execute: () => Promise.resolve({ charged: 99 }),
    };

    await runTool({
      requestId: "req-1",
      tool,
      args: {},
      approved: true,
      idempotencyKey: "pay-1",
      ledger,
      audit,
      budget,
    });
    // 预算已用完，但重放命中账本，不视为新步骤
    const replayed = await runTool({
      requestId: "req-2",
      tool,
      args: {},
      approved: true,
      idempotencyKey: "pay-1",
      ledger,
      audit,
      budget,
    });

    expect(replayed).toMatchObject({ ok: true });
  });
});

describe("dryRun", () => {
  it("写工具 dry-run 不执行，返回预览标记", async () => {
    let charges = 0;
    const audit: AuditEvent[] = [];

    const result = await runTool({
      requestId: "req-dry",
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
      dryRun: true,
      audit,
    });

    expect(result).toMatchObject({ ok: true, dryRun: true });
    expect(charges).toBe(0);
    expect(audit.some((event) => event.outcome === "dry_run")).toBe(true);
  });

  it("只读工具 dry-run 照常执行", async () => {
    const result = await runTool({
      requestId: "req-dry-read",
      tool: {
        name: "search",
        risk: "read",
        execute: () => Promise.resolve("hits"),
      },
      args: {},
      dryRun: true,
      audit: [],
    });

    expect(result).toEqual({ ok: true, data: "hits" });
  });
});
