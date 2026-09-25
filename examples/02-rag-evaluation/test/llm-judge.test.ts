import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { judgeAnswerRelevance } from "../src/llm-judge.js";

const POINTS = ["RAG 先检索再生成", "检索用向量相似度"];

describe("judgeAnswerRelevance", () => {
  it("按要点覆盖比例打分", async () => {
    const score = await judgeAnswerRelevance(
      "RAG 怎么工作？",
      "RAG 先检索相关文档再生成答案。",
      POINTS,
      async () => JSON.stringify({ covered: [true, false] }),
    );

    assert.equal(score, 0.5);
  });

  it("模型输出带围栏也能解析", async () => {
    const score = await judgeAnswerRelevance("q", "a", POINTS, async () =>
      "```json\n{\"covered\":[true,true]}\n```",
    );

    assert.equal(score, 1);
  });

  it("输出无法解析：记 0 分而不是抛异常", async () => {
    const score = await judgeAnswerRelevance("q", "a", POINTS, async () => "不知道");

    assert.equal(score, 0);
  });

  it("covered 数组长度不齐：缺失要点按未覆盖计", async () => {
    const score = await judgeAnswerRelevance("q", "a", POINTS, async () =>
      JSON.stringify({ covered: [true] }),
    );

    assert.equal(score, 0.5);
  });

  it("无要点可判：直接满分且不调模型", async () => {
    let called = false;
    const score = await judgeAnswerRelevance("q", "a", [], async () => {
      called = true;
      return "{}";
    });

    assert.equal(score, 1);
    assert.equal(called, false);
  });
});
