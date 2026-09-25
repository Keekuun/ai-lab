import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { answerWithLlm } from "../src/llm-answer.js";
import type { Chunk } from "../src/types.js";

const CHUNKS: Chunk[] = [
  { chunkId: "a#0", source: "docs/04-rag.md", text: "RAG 先用检索找到相关文档，再让模型基于文档回答。" },
  { chunkId: "b#0", source: "docs/05-embedding.md", text: "Embedding 把文本映射为向量，用余弦相似度度量语义。" },
];

describe("answerWithLlm", () => {
  it("解析规范 JSON：答案 + 引用序号映射回 chunk", async () => {
    const answer = await answerWithLlm("RAG 怎么工作？", CHUNKS, async () =>
      JSON.stringify({ answer: "先检索再生成 [1]。", citations: [1], abstained: false }),
    );

    assert.equal(answer.abstained, false);
    assert.equal(answer.text, "先检索再生成 [1]。");
    assert.equal(answer.citations.length, 1);
    assert.equal(answer.citations[0].source, "docs/04-rag.md");
    assert.equal(answer.citations[0].chunkId, "a#0");
  });

  it("容忍 ```json 代码围栏", async () => {
    const answer = await answerWithLlm("RAG 怎么工作？", CHUNKS, async () =>
      "```json\n{\"answer\":\"基于证据回答\",\"citations\":[2],\"abstained\":false}\n```",
    );

    assert.equal(answer.abstained, false);
    assert.equal(answer.citations[0].source, "docs/05-embedding.md");
  });

  it("模型判证据不足：abstained=true 透传", async () => {
    const answer = await answerWithLlm("火星上最好的火锅？", CHUNKS, async () =>
      JSON.stringify({ answer: "证据不足", citations: [], abstained: true }),
    );

    assert.equal(answer.abstained, true);
    assert.equal(answer.citations.length, 0);
  });

  it("模型输出完全不是 JSON：兜底拒答而不是抛异常", async () => {
    const answer = await answerWithLlm("RAG 怎么工作？", CHUNKS, async () => "我觉得吧，这个嘛……");

    assert.equal(answer.abstained, true);
    assert.match(answer.text, /无法解析|拒绝/);
  });

  it("越界引用序号被丢弃", async () => {
    const answer = await answerWithLlm("RAG 怎么工作？", CHUNKS, async () =>
      JSON.stringify({ answer: "回答", citations: [1, 99, -1], abstained: false }),
    );

    assert.equal(answer.citations.length, 1);
    assert.equal(answer.citations[0].chunkId, "a#0");
  });

  it("prompt 带证据编号、正文和来源，并要求只依据证据", async () => {
    let capturedPrompt = "";
    await answerWithLlm("RAG 怎么工作？", CHUNKS, async (prompt) => {
      capturedPrompt = prompt;
      return JSON.stringify({ answer: "x", citations: [1], abstained: false });
    });

    assert.match(capturedPrompt, /\[1\]/);
    assert.match(capturedPrompt, /RAG 先用检索找到相关文档/);
    assert.match(capturedPrompt, /docs\/04-rag\.md/);
    assert.match(capturedPrompt, /只能|仅依据|根据.*证据/);
  });

  it("检索结果为空：不调模型直接拒答", async () => {
    let called = false;
    const answer = await answerWithLlm("任意问题", [], async () => {
      called = true;
      return "{}";
    });

    assert.equal(called, false);
    assert.equal(answer.abstained, true);
  });

  it("第一次输出不合规时重试一次：第二次合规则采用", async () => {
    let calls = 0;
    const answer = await answerWithLlm("RAG 怎么工作？", CHUNKS, async () => {
      calls += 1;
      return calls === 1
        ? "{\"thought\": \"让我想想" // 截断的坏 JSON
        : JSON.stringify({ answer: "先检索再生成。", citations: [1], abstained: false });
    });

    assert.equal(calls, 2);
    assert.equal(answer.abstained, false);
    assert.equal(answer.text, "先检索再生成。");
  });

  it("重试后空答案也重试：第二次给出正文", async () => {
    let calls = 0;
    const answer = await answerWithLlm("RAG 怎么工作？", CHUNKS, async () => {
      calls += 1;
      return calls === 1
        ? JSON.stringify({ answer: "", citations: [], abstained: false })
        : JSON.stringify({ answer: "有正文了。", citations: [1], abstained: false });
    });

    assert.equal(calls, 2);
    assert.equal(answer.abstained, false);
  });

  it("两次都不合规才兜底拒答", async () => {
    let calls = 0;
    const answer = await answerWithLlm("RAG 怎么工作？", CHUNKS, async () => {
      calls += 1;
      return "完全不是 JSON";
    });

    assert.equal(calls, 2);
    assert.equal(answer.abstained, true);
  });

  it("第一次就合规：不重试", async () => {
    let calls = 0;
    await answerWithLlm("RAG 怎么工作？", CHUNKS, async () => {
      calls += 1;
      return JSON.stringify({ answer: "直接合规", citations: [1], abstained: false });
    });

    assert.equal(calls, 1);
  });
});
