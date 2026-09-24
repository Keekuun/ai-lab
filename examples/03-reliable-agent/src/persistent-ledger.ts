import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Ledger } from "./run-tool.js";

class PersistentLedger extends Map<string, unknown> {
  private constructor(private readonly path: string) {
    super();
  }

  static load(path: string): PersistentLedger {
    const ledger = new PersistentLedger(path);
    if (!existsSync(path)) {
      return ledger;
    }
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    assert(typeof parsed === "object" && parsed !== null, "账本文件必须是 JSON 对象");
    for (const [key, value] of Object.entries(parsed)) {
      ledger.set(key, value);
    }
    return ledger;
  }

  override set(key: string, value: unknown): this {
    super.set(key, value);
    writeFileSync(this.path, JSON.stringify(Object.fromEntries(this), null, 2));
    return this;
  }
}

export function createPersistentLedger(path: string): Ledger {
  assert(path.trim().length > 0, "账本路径不能为空");
  return PersistentLedger.load(path);
}
