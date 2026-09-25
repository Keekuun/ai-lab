import { describe, expect, it } from "vitest";
import { createBudget, runTool, type AuditEvent } from "../src/run-tool.js";

function createClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe("预算：最大耗时", () => {
  it("总耗时超 maxDurationMs 后拒绝执行", async () => {
    const clock = createClock();
    const budget = createBudget({ maxSteps: 10, maxDurationMs: 1000, now: clock.now });
    const audit: AuditEvent[] = [];
    const tool = {
      name: "step",
      risk: "read" as const,
      execute: () => Promise.resolve("ok"),
    };

    await runTool({ requestId: "req-1", tool, args: {}, audit, budget });
    clock.advance(1001);
    const result = await runTool({ requestId: "req-2", tool, args: {}, audit, budget });

    expect(result).toMatchObject({ ok: false, reason: "budget_exceeded" });
  });

  it("耗时未超限时正常执行", async () => {
    const clock = createClock();
    const budget = createBudget({ maxSteps: 10, maxDurationMs: 1000, now: clock.now });

    await runTool({
      requestId: "req-1",
      tool: { name: "step", risk: "read", execute: () => Promise.resolve("ok") },
      args: {},
      audit: [],
      budget,
    });
    clock.advance(999);
    const result = await runTool({
      requestId: "req-2",
      tool: { name: "step", risk: "read", execute: () => Promise.resolve("ok") },
      args: {},
      audit: [],
      budget,
    });

    expect(result).toMatchObject({ ok: true });
  });
});

describe("审计带版本", () => {
  it("ToolDefinition 声明 version 时审计事件带上", async () => {
    const audit: AuditEvent[] = [];
    await runTool({
      requestId: "req-v",
      tool: {
        name: "search",
        risk: "read",
        version: "1.4.0",
        execute: () => Promise.resolve("ok"),
      },
      args: {},
      audit,
    });

    expect(audit[0]).toMatchObject({ toolName: "search", toolVersion: "1.4.0" });
  });

  it("未声明版本时审计事件不含该字段", async () => {
    const audit: AuditEvent[] = [];
    await runTool({
      requestId: "req-nov",
      tool: { name: "search", risk: "read", execute: () => Promise.resolve("ok") },
      args: {},
      audit,
    });

    expect(audit[0]?.toolVersion).toBeUndefined();
  });
});
