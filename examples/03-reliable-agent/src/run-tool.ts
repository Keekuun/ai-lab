import assert from "node:assert/strict";

export type RiskLevel = "read" | "write" | "high";

export type AuditOutcome =
  | "ok"
  | "timeout"
  | "error"
  | "needs_approval"
  | "circuit_open"
  | "budget_exceeded"
  | "dry_run"
  | "retried";

export type AuditEvent = {
  requestId: string;
  toolName: string;
  toolVersion?: string;
  risk: RiskLevel;
  outcome: AuditOutcome;
};

export type Ledger = Map<string, unknown>;

export type ToolResult<T> =
  | { ok: true; data: T; truncated?: boolean; dryRun?: boolean }
  | {
      ok: false;
      reason: "timeout" | "needs_approval" | "circuit_open" | "budget_exceeded" | "error";
      error?: string;
    };

export type ToolDefinition<T> = {
  name: string;
  risk: RiskLevel;
  version?: string;
  timeoutMs?: number;
  maxRetries?: number;
  maxOutputChars?: number;
  cost?: number;
  execute: (args: unknown) => Promise<T>;
};

const DEFAULT_MAX_RETRIES = 1;

export type CircuitState = "closed" | "open" | "half_open";

export type CircuitBreaker = {
  readonly failureThreshold: number;
  readonly cooldownMs: number;
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: number;
  readonly now: () => number;
};

export function createCircuitBreaker(options: {
  failureThreshold: number;
  cooldownMs: number;
  now?: () => number;
}): CircuitBreaker {
  assert(options.failureThreshold >= 1, "failureThreshold 必须 >= 1");
  assert(options.cooldownMs >= 1, "cooldownMs 必须 >= 1");
  return {
    failureThreshold: options.failureThreshold,
    cooldownMs: options.cooldownMs,
    state: "closed",
    consecutiveFailures: 0,
    openedAt: 0,
    now: options.now ?? Date.now,
  };
}

function onCircuitSuccess(breaker: CircuitBreaker): void {
  breaker.state = "closed";
  breaker.consecutiveFailures = 0;
}

function onCircuitFailure(breaker: CircuitBreaker): void {
  breaker.consecutiveFailures += 1;
  if (breaker.consecutiveFailures >= breaker.failureThreshold) {
    breaker.state = "open";
    breaker.openedAt = breaker.now();
  }
}

// 30 护栏：每次运行有最大步骤、最大耗时和最大成本。跨 runTool 调用共享，超预算拒绝执行。
export type Budget = {
  readonly maxSteps: number;
  readonly maxCost?: number;
  readonly maxDurationMs?: number;
  readonly startedAt: number;
  readonly now: () => number;
  usedSteps: number;
  usedCost: number;
};

export function createBudget(options: {
  maxSteps: number;
  maxCost?: number;
  maxDurationMs?: number;
  now?: () => number;
}): Budget {
  assert(options.maxSteps >= 1, "maxSteps 必须 >= 1");
  if (options.maxCost !== undefined) {
    assert(options.maxCost >= 0, "maxCost 必须 >= 0");
  }
  if (options.maxDurationMs !== undefined) {
    assert(options.maxDurationMs >= 1, "maxDurationMs 必须 >= 1");
  }
  const now = options.now ?? Date.now;
  return {
    maxSteps: options.maxSteps,
    maxCost: options.maxCost,
    maxDurationMs: options.maxDurationMs,
    startedAt: now(),
    now,
    usedSteps: 0,
    usedCost: 0,
  };
}

function budgetExceeded(budget: Budget, cost: number): boolean {
  return (
    budget.usedSteps >= budget.maxSteps ||
    (budget.maxCost !== undefined && budget.usedCost + cost > budget.maxCost) ||
    (budget.maxDurationMs !== undefined &&
      budget.now() - budget.startedAt >= budget.maxDurationMs)
  );
}

class TimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`tool timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

function record(
  audit: AuditEvent[],
  requestId: string,
  tool: { name: string; risk: RiskLevel; version?: string },
  outcome: AuditOutcome,
): void {
  audit.push({
    requestId,
    toolName: tool.name,
    toolVersion: tool.version,
    risk: tool.risk,
    outcome,
  });
}

async function withTimeout<T>(
  execute: () => Promise<T>,
  timeoutMs: number | undefined,
): Promise<T> {
  if (timeoutMs === undefined) {
    return execute();
  }
  assert(timeoutMs >= 1, "timeoutMs 必须 >= 1");

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      execute(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new TimeoutError(timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export async function runTool<T>(options: {
  requestId: string;
  tool: ToolDefinition<T>;
  args: unknown;
  approved?: boolean;
  idempotencyKey?: string;
  ledger?: Ledger;
  audit: AuditEvent[];
  circuitBreaker?: CircuitBreaker;
  budget?: Budget;
  dryRun?: boolean;
}): Promise<ToolResult<T>> {
  assert(options.requestId.trim().length > 0, "requestId 不能为空");
  assert(options.tool.name.trim().length > 0, "tool.name 不能为空");

  if (options.tool.risk === "high" && options.approved !== true) {
    record(options.audit, options.requestId, options.tool, "needs_approval");
    return { ok: false, reason: "needs_approval" };
  }

  // dry-run：预览「如果要做会发生什么」。只读工具无副作用，照常执行
  if (options.dryRun === true && options.tool.risk !== "read") {
    record(options.audit, options.requestId, options.tool, "dry_run");
    return { ok: true, data: undefined as T, dryRun: true };
  }

  if (options.idempotencyKey && options.ledger?.has(options.idempotencyKey)) {
    return {
      ok: true,
      data: options.ledger.get(options.idempotencyKey) as T,
    };
  }

  const breaker = options.circuitBreaker;
  if (breaker?.state === "open") {
    if (breaker.now() - breaker.openedAt < breaker.cooldownMs) {
      record(options.audit, options.requestId, options.tool, "circuit_open");
      return { ok: false, reason: "circuit_open" };
    }
    // 冷却期过后放行一次试探
    breaker.state = "half_open";
  }

  const cost = options.tool.cost ?? 0;
  if (options.budget && budgetExceeded(options.budget, cost)) {
    record(options.audit, options.requestId, options.tool, "budget_exceeded");
    return { ok: false, reason: "budget_exceeded" };
  }
  if (options.budget) {
    options.budget.usedSteps += 1;
    options.budget.usedCost += cost;
  }

  const maxRetries = options.tool.maxRetries ?? DEFAULT_MAX_RETRIES;
  assert(maxRetries >= 1, "maxRetries 必须 >= 1");

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      let data: T = await withTimeout(
        () => options.tool.execute(options.args),
        options.tool.timeoutMs,
      );
      // 30：Tool 输出限制长度，避免上下文膨胀。只截断字符串，结构化输出原样返回
      let truncated = false;
      const maxOutputChars = options.tool.maxOutputChars;
      if (maxOutputChars !== undefined) {
        assert(maxOutputChars >= 1, "maxOutputChars 必须 >= 1");
        if (typeof data === "string" && data.length > maxOutputChars) {
          data = data.slice(0, maxOutputChars) as T;
          truncated = true;
        }
      }
      if (options.idempotencyKey && options.ledger) {
        options.ledger.set(options.idempotencyKey, data);
      }
      if (breaker) {
        onCircuitSuccess(breaker);
      }
      record(options.audit, options.requestId, options.tool, "ok");
      return truncated ? { ok: true, data, truncated } : { ok: true, data };
    } catch (error) {
      const isTimeout = error instanceof TimeoutError;
      if (attempt < maxRetries) {
        record(options.audit, options.requestId, options.tool, "retried");
        continue;
      }
      if (breaker) {
        onCircuitFailure(breaker);
      }
      record(
        options.audit,
        options.requestId,
        options.tool,
        isTimeout ? "timeout" : "error",
      );
      return {
        ok: false,
        reason: isTimeout ? "timeout" : "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return { ok: false, reason: "error", error: "unreachable" };
}
