import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createCalcTool, createGetTimeTool } from "../src/tools.js";

describe("calc 工具", () => {
  const calc = createCalcTool();

  it("四则运算", async () => {
    const add = await calc.execute("c1", { a: 2, b: 3, op: "add" });
    assert.equal(add.content[0].type, "text");
    if (add.content[0].type === "text") {
      assert.equal(add.content[0].text, "5");
    }

    const div = await calc.execute("c2", { a: 7, b: 2, op: "div" });
    if (div.content[0].type === "text") {
      assert.equal(div.content[0].text, "3.5");
    }
  });

  it("除零返回错误说明而不是抛异常", async () => {
    const result = await calc.execute("c3", { a: 1, b: 0, op: "div" });
    if (result.content[0].type === "text") {
      assert.match(result.content[0].text, /除零|不能/);
    }
    assert.equal(result.details?.error, true);
  });

  it("结果保留合理精度", async () => {
    const result = await calc.execute("c4", { a: 1, b: 3, op: "div" });
    if (result.content[0].type === "text") {
      assert.match(result.content[0].text, /^0\.333333/);
    }
  });
});

describe("get_time 工具", () => {
  it("返回 ISO 时间文本", async () => {
    const tool = createGetTimeTool(() => new Date("2026-09-26T12:00:00.000Z"));
    const result = await tool.execute("t1");
    if (result.content[0].type === "text") {
      assert.match(result.content[0].text, /2026-09-26T12:00:00/);
    }
  });
});
