import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { answerWithLlm, ANSWER_JSON_SCHEMA } from "../src/llm-answer.js";
import { judgeAnswerRelevance, JUDGE_JSON_SCHEMA } from "../src/llm-judge.js";
import { createOllamaClient } from "../src/ollama.js";
import { withEmbeddingCache } from "../src/retrieve.js";
import type { Chunk } from "../src/types.js";

// 真实 Ollama 集成测试：本地有服务才跑，CI 上自动跳过。
// timeout 给足：gemma4 冷启动加载就要几十秒，9.6GB 模型生成约 26 tok/s
const client = createOllamaClient({ timeoutMs: 180_000 });
const reachable = await client.isReachable();
const tags = reachable
  ? (await (await fetch(`${client.host}/api/tags`)).json()) as { models?: Array<{ name: string }> }
  : { models: [] };
const hasEmbedModel = Boolean(tags.models?.some((model) => model.name.startsWith(client.embedModel)));

const generateJson = (prompt: string) =>
  client.generate(prompt, { schema: ANSWER_JSON_SCHEMA, think: false });
const generateJudgeJson = (prompt: string) =>
  client.generate(prompt, { schema: JUDGE_JSON_SCHEMA, think: false });

describe.skipIf(!reachable)("ollama 集成（真实 gemma4）", () => {
  it("generate 返回非空中文回答", async () => {
    const text = await client.generate("用一句话回答：什么是检索增强生成？");

    assert.ok(text.trim().length > 5);
  }, 120_000);

  it("answerWithLlm：证据充分时作答并带引用", async () => {
    const chunks: Chunk[] = [
      {
        chunkId: "rag#0",
        source: "docs/04-rag.md",
        text: "RAG 的流程是：先用检索器从知识库找到相关文档片段，再把这些片段放进 Prompt，让模型基于片段生成答案并标注引用。",
      },
    ];

    const answer = await answerWithLlm("RAG 的基本流程是什么？", chunks, generateJson);

    assert.equal(answer.abstained, false);
    assert.ok(answer.text.length > 10);
    assert.ok(answer.citations.some((citation) => citation.source === "docs/04-rag.md"));
  }, 120_000);

  it("answerWithLlm：证据与问题无关时应拒答", async () => {
    const chunks: Chunk[] = [
      { chunkId: "cook#0", source: "fixtures/cooking.md", text: "红烧肉的做法：五花肉切块焯水，加冰糖炒糖色，小火炖一小时。" },
    ];

    const answer = await answerWithLlm("Kubernetes 的 Pod 驱逐策略有哪些？", chunks, generateJson);

    assert.equal(answer.abstained, true);
  }, 120_000);

  it("judgeAnswerRelevance：切题答案得分高于跑题答案", async () => {
    const question = "RAG 怎么减少幻觉？";
    const points = ["答案基于检索到的证据", "证据不足时拒答"];

    const good = await judgeAnswerRelevance(
      question,
      "RAG 让模型只基于检索到的证据回答，并在证据不足时拒绝回答，从而减少编造。",
      points,
      generateJudgeJson,
    );
    const bad = await judgeAnswerRelevance(question, "今天天气不错，适合出门散步。", points, generateJudgeJson);

    assert.ok(good > bad, `切题 ${good} 应高于跑题 ${bad}`);
  }, 120_000);
});

describe.skipIf(!reachable || !hasEmbedModel)(`ollama 集成（真实 ${client.embedModel}）`, () => {
  it("embed 返回非零维向量，语义近的相似度更高", async () => {
    const { cosineSimilarity } = await import("../src/retrieve.js");
    const nearA = await client.embed("检索增强生成让模型基于文档回答");
    const nearB = await client.embed("RAG 先检索文档再生成答案");
    const far = await client.embed("红烧肉要炒糖色小火慢炖");

    assert.ok(nearA.length > 0);
    assert.ok(
      cosineSimilarity(nearA, nearB) > cosineSimilarity(nearA, far),
      "语义相近的文本相似度应更高",
    );
  }, 120_000);

  it("withEmbeddingCache：相同文本只算一次", async () => {
    let calls = 0;
    const cached = withEmbeddingCache(async (text: string) => {
      calls += 1;
      return client.embed(text);
    });

    await cached("同一段文本");
    await cached("同一段文本");

    assert.equal(calls, 1);
  }, 120_000);
});
