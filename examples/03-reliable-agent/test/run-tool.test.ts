import { describe, expect, it } from "vitest";
import { runTool, type AuditEvent, type Ledger } from "../src/run-tool.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("runTool", () => {
  it("超时后失败并写入 audit，不把迟到结果当成功", async () => {
    const audit: AuditEvent[] = [];

    const result = await runTool({
      requestId: "req-timeout",
      tool: {
        name: "slow_search",
        risk: "read",
        timeoutMs: 20,
        execute: async () => {
          await sleep(80);
          return "late";
        },
      },
      args: { q: "blog" },
      audit,
    });

    expect(result).toMatchObject({ ok: false, reason: "timeout" });
    expect(audit.some((event) => event.outcome === "timeout")).toBe(true);
  });

  it("失败后按次数重试，第三次成功", async () => {
    let calls = 0;
    const audit: AuditEvent[] = [];

    const result = await runTool({
      requestId: "req-retry",
      tool: {
        name: "flaky_search",
        risk: "read",
        maxRetries: 3,
        execute: async () => {
          calls += 1;
          if (calls < 3) {
            throw new Error("upstream down");
          }
          return { hits: 1 };
        },
      },
      args: {},
      audit,
    });

    expect(result).toEqual({ ok: true, data: { hits: 1 } });
    expect(calls).toBe(3);
    expect(audit.filter((event) => event.outcome === "retried")).toHaveLength(2);
  });

  it("高风险未审批时不执行工具", async () => {
    let executed = false;
    const audit: AuditEvent[] = [];

    const result = await runTool({
      requestId: "req-deny",
      tool: {
        name: "send_email",
        risk: "high",
        execute: async () => {
          executed = true;
          return "sent";
        },
      },
      args: { to: "user@example.com" },
      approved: false,
      audit,
    });

    expect(executed).toBe(false);
    expect(result).toMatchObject({ ok: false, reason: "needs_approval" });
    expect(audit.some((event) => event.outcome === "needs_approval")).toBe(true);
  });

  it("高风险已审批才执行", async () => {
    const result = await runTool({
      requestId: "req-approve",
      tool: {
        name: "send_email",
        risk: "high",
        execute: async () => "sent",
      },
      args: { to: "user@example.com" },
      approved: true,
      audit: [],
    });

    expect(result).toEqual({ ok: true, data: "sent" });
  });

  it("相同 idempotencyKey 再次执行不会重复扣款", async () => {
    let charges = 0;
    const ledger: Ledger = new Map();
    const tool = {
      name: "charge",
      risk: "high" as const,
      execute: async () => {
        charges += 1;
        return { charged: 99 };
      },
    };

    const first = await runTool({
      requestId: "req-pay-1",
      tool,
      args: { orderId: "o-1" },
      approved: true,
      idempotencyKey: "pay-o-1",
      ledger,
      audit: [],
    });
    const second = await runTool({
      requestId: "req-pay-2",
      tool,
      args: { orderId: "o-1" },
      approved: true,
      idempotencyKey: "pay-o-1",
      ledger,
      audit: [],
    });

    expect(charges).toBe(1);
    expect(first).toEqual({ ok: true, data: { charged: 99 } });
    expect(second).toEqual({ ok: true, data: { charged: 99 } });
  });
});
