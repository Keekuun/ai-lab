import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPersistentLedger } from "../src/persistent-ledger.js";
import { runTool, type Ledger } from "../src/run-tool.js";

const tempDirs: string[] = [];

function tempLedgerPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "ai-lab-03-ledger-"));
  tempDirs.push(dir);
  return join(dir, "ledger.json");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createChargeTool(onCharge: () => void) {
  return {
    name: "charge",
    risk: "high" as const,
    execute: async () => {
      onCharge();
      return { charged: 99 };
    },
  };
}

describe("createPersistentLedger", () => {
  it("重启后同一幂等键命中账本，不重复扣款", async () => {
    const path = tempLedgerPath();
    let charges = 0;
    const tool = createChargeTool(() => {
      charges += 1;
    });

    const ledgerBeforeRestart: Ledger = createPersistentLedger(path);
    const first = await runTool({
      requestId: "req-pay-1",
      tool,
      args: { orderId: "o-1" },
      approved: true,
      idempotencyKey: "pay-o-1",
      ledger: ledgerBeforeRestart,
      audit: [],
    });
    expect(first).toEqual({ ok: true, data: { charged: 99 } });
    expect(charges).toBe(1);

    // 模拟服务重启：从同一文件重建账本
    const ledgerAfterRestart: Ledger = createPersistentLedger(path);
    const replayed = await runTool({
      requestId: "req-pay-2",
      tool,
      args: { orderId: "o-1" },
      approved: true,
      idempotencyKey: "pay-o-1",
      ledger: ledgerAfterRestart,
      audit: [],
    });

    expect(replayed).toEqual({ ok: true, data: { charged: 99 } });
    expect(charges).toBe(1);
  });

  it("新键在重启后仍可正常写入", async () => {
    const path = tempLedgerPath();
    const first = createPersistentLedger(path);
    first.set("a", 1);

    const second = createPersistentLedger(path);
    expect(second.get("a")).toBe(1);
    second.set("b", 2);

    const third = createPersistentLedger(path);
    expect(third.get("a")).toBe(1);
    expect(third.get("b")).toBe(2);
  });
});
