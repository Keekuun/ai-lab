import { describe, expect, it } from "vitest";
import {
  createCircuitBreaker,
  runTool,
  type AuditEvent,
  type CircuitBreaker,
} from "../src/run-tool.js";

const COOLDOWN_MS = 1000;
const FAILURE_THRESHOLD = 2;

function createFailingTool(): { name: string; risk: "read"; maxRetries: number; execute: () => Promise<never> } {
  return {
    name: "always_down",
    risk: "read",
    maxRetries: 1,
    execute: () => Promise.reject(new Error("service down")),
  };
}

function createClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

async function runFailing(
  breaker: CircuitBreaker,
  audit: AuditEvent[],
  requestId: string,
): Promise<void> {
  await runTool({
    requestId,
    tool: createFailingTool(),
    args: {},
    audit,
    circuitBreaker: breaker,
  });
}

describe("circuitBreaker", () => {
  it("连续失败达到阈值后熔断，handler 不再执行", async () => {    const clock = createClock();
    const breaker = createCircuitBreaker({
      failureThreshold: FAILURE_THRESHOLD,
      cooldownMs: COOLDOWN_MS,
      now: clock.now,
    });
    const audit: AuditEvent[] = [];

    await runFailing(breaker, audit, "req-1");
    await runFailing(breaker, audit, "req-2");
    expect(breaker.state).toBe("open");

    let calls = 0;
    const result = await runTool({
      requestId: "req-3",
      tool: {
        name: "always_down",
        risk: "read",
        execute: async () => {
          calls += 1;
          return "unreachable";
        },
      },
      args: {},
      audit,
      circuitBreaker: breaker,
    });

    expect(result).toMatchObject({ ok: false, reason: "circuit_open" });
    expect(calls).toBe(0);
    expect(audit.some((event) => event.outcome === "circuit_open")).toBe(true);
  });

  it("冷却期内保持打开，冷却后半开试探成功则关闭", async () => {
    const clock = createClock();
    const breaker = createCircuitBreaker({
      failureThreshold: FAILURE_THRESHOLD,
      cooldownMs: COOLDOWN_MS,
      now: clock.now,
    });
    const audit: AuditEvent[] = [];

    await runFailing(breaker, audit, "req-1");
    await runFailing(breaker, audit, "req-2");
    expect(breaker.state).toBe("open");

    clock.advance(COOLDOWN_MS - 1);
    const stillOpen = await runTool({
      requestId: "req-3",
      tool: { name: "any", risk: "read", execute: () => Promise.resolve("x") },
      args: {},
      audit,
      circuitBreaker: breaker,
    });
    expect(stillOpen).toMatchObject({ ok: false, reason: "circuit_open" });

    clock.advance(1);
    const probe = await runTool({
      requestId: "req-4",
      tool: { name: "recovered", risk: "read", execute: () => Promise.resolve("back") },
      args: {},
      audit,
      circuitBreaker: breaker,
    });

    expect(probe).toMatchObject({ ok: true, data: "back" });
    expect(breaker.state).toBe("closed");
  });

  it("半开试探失败则重新打开并重新计时", async () => {
    const clock = createClock();
    const breaker = createCircuitBreaker({
      failureThreshold: FAILURE_THRESHOLD,
      cooldownMs: COOLDOWN_MS,
      now: clock.now,
    });
    const audit: AuditEvent[] = [];

    await runFailing(breaker, audit, "req-1");
    await runFailing(breaker, audit, "req-2");

    clock.advance(COOLDOWN_MS);
    await runFailing(breaker, audit, "req-3");
    expect(breaker.state).toBe("open");

    clock.advance(COOLDOWN_MS - 1);
    const result = await runTool({
      requestId: "req-4",
      tool: { name: "any", risk: "read", execute: () => Promise.resolve("x") },
      args: {},
      audit,
      circuitBreaker: breaker,
    });
    expect(result).toMatchObject({ ok: false, reason: "circuit_open" });
  });

  it("成功会重置连续失败计数", async () => {
    const clock = createClock();
    const breaker = createCircuitBreaker({
      failureThreshold: FAILURE_THRESHOLD,
      cooldownMs: COOLDOWN_MS,
      now: clock.now,
    });
    const audit: AuditEvent[] = [];

    await runFailing(breaker, audit, "req-1");
    await runTool({
      requestId: "req-2",
      tool: { name: "ok_tool", risk: "read", execute: () => Promise.resolve("fine") },
      args: {},
      audit,
      circuitBreaker: breaker,
    });
    await runFailing(breaker, audit, "req-3");
    await runFailing(breaker, audit, "req-4");

    // 中间成功过一次，连续失败从 req-3 重算，req-4 后才达到阈值
    expect(breaker.state).toBe("open");
  });
});
