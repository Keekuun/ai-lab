import assert from "node:assert/strict";

export type RiskLevel = "read" | "write" | "high";

export type AuditOutcome =
  | "ok"
  | "timeout"
  | "error"
  | "needs_approval"
  | "retried";

export type AuditEvent = {
  requestId: string;
  toolName: string;
  risk: RiskLevel;
  outcome: AuditOutcome;
};

export type Ledger = Map<string, unknown>;

export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "timeout" | "needs_approval" | "error"; error?: string };

export type ToolDefinition<T> = {
  name: string;
  risk: RiskLevel;
  timeoutMs?: number;
  maxRetries?: number;
  execute: (args: unknown) => Promise<T>;
};

const DEFAULT_MAX_RETRIES = 1;

class TimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`tool timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

function record(
  audit: AuditEvent[],
  requestId: string,
  tool: { name: string; risk: RiskLevel },
  outcome: AuditOutcome,
): void {
  audit.push({
    requestId,
    toolName: tool.name,
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
}): Promise<ToolResult<T>> {
  assert(options.requestId.trim().length > 0, "requestId 不能为空");
  assert(options.tool.name.trim().length > 0, "tool.name 不能为空");

  if (options.tool.risk === "high" && options.approved !== true) {
    record(options.audit, options.requestId, options.tool, "needs_approval");
    return { ok: false, reason: "needs_approval" };
  }

  if (options.idempotencyKey && options.ledger?.has(options.idempotencyKey)) {
    return {
      ok: true,
      data: options.ledger.get(options.idempotencyKey) as T,
    };
  }

  const maxRetries = options.tool.maxRetries ?? DEFAULT_MAX_RETRIES;
  assert(maxRetries >= 1, "maxRetries 必须 >= 1");

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const data = await withTimeout(
        () => options.tool.execute(options.args),
        options.tool.timeoutMs,
      );
      if (options.idempotencyKey && options.ledger) {
        options.ledger.set(options.idempotencyKey, data);
      }
      record(options.audit, options.requestId, options.tool, "ok");
      return { ok: true, data };
    } catch (error) {
      const isTimeout = error instanceof TimeoutError;
      if (attempt < maxRetries) {
        record(options.audit, options.requestId, options.tool, "retried");
        continue;
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
