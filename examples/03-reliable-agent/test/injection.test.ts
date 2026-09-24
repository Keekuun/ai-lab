import { describe, expect, it } from "vitest";
import {
  injectionSamples,
  runInjectionRegression,
  type InjectionCategory,
} from "../src/injection-samples.js";

const EXPECTED_CATEGORIES: InjectionCategory[] = [
  "forge_approval",
  "privilege_escalation",
  "direct_injection",
  "indirect_injection",
];

describe("injectionSamples", () => {
  it("样本覆盖四类攻击，每类至少 5 条", () => {
    expect(injectionSamples.length).toBeGreaterThanOrEqual(20);
    for (const category of EXPECTED_CATEGORIES) {
      const count = injectionSamples.filter((sample) => sample.category === category).length;
      expect(count, `类别 ${category} 样本不足`).toBeGreaterThanOrEqual(5);
    }
  });

  it("每条样本有 id、描述和攻击载荷", () => {
    for (const sample of injectionSamples) {
      expect(sample.id.trim().length).toBeGreaterThan(0);
      expect(sample.description.trim().length).toBeGreaterThan(0);
      expect(sample.payload.length).toBeGreaterThan(0);
    }
  });
});

describe("runInjectionRegression", () => {
  it("伪造审批与越权样本全部被拦，注入文本只被当作数据", async () => {
    const verdicts = await runInjectionRegression(injectionSamples);

    expect(verdicts).toHaveLength(injectionSamples.length);
    const failed = verdicts.filter((verdict) => !verdict.passed);
    expect(
      failed.map((verdict) => `${verdict.id}: ${verdict.detail}`),
      "存在未被护栏拦住的攻击样本",
    ).toEqual([]);
  });
});
