import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { evaluateRag } from "../src/evaluate.js";
import { withEmbeddingCache } from "../src/retrieve.js";
import type { Chunk, RagAnswer } from "../src/types.js";

const DOCUMENTS = [{ source: "docs/a.md", text: "RAG 先检索再生成。" }];
const CASES = [
  {
    id: "q1",
    question: "RAG 怎么工作？",
    relevantSources: ["docs/a.md"],
    expectedPoints: ["先检索"],
  },
];

function chunker(documents: Array<{ source: string; text: string }>): Chunk[] {
  return documents.map((document, index) => ({
    chunkId: `${document.source}#${index}`,
    source: document.source,
    text: document.text,
  }));
}

describe("evaluateRag 注入 answer/judge", () => {
  it("使用注入的 answerer 替代默认词覆盖实现", async () => {
    let sawQuestion = "";
    const answer = (question: string): RagAnswer => {
      sawQuestion = question;
      return { text: "注入的回答", citations: [], abstained: false };
    };

    await evaluateRag({ documents: DOCUMENTS, cases: CASES, chunker, k: 1, answer });

    assert.equal(sawQuestion, "RAG 怎么工作？");
  });

  it("提供 judge 时结果带 llmRelevance；拒答的该答样本不计入", async () => {
    const judged: string[] = [];
    const answer = (question: string): RagAnswer => ({
      text: question.includes("拒答") ? "拒答" : "正常回答",
      citations: [],
      abstained: question.includes("拒答"),
    });
    const judge = async (_question: string, answerText: string) => {
      judged.push(answerText);
      return 0.75;
    };
    const cases = [
      ...CASES,
      {
        id: "q2",
        question: "请拒答这个问题",
        relevantSources: [],
        expectedPoints: ["无关要点"],
        shouldAbstain: true,
      },
    ];

    const result = await evaluateRag({ documents: DOCUMENTS, cases, chunker, k: 1, answer, judge });

    assert.equal(result.llmRelevance, 0.75);
    assert.deepEqual(judged, ["正常回答"]);
  });

  it("不提供 judge 时结果没有 llmRelevance 字段", async () => {
    const result = await evaluateRag({ documents: DOCUMENTS, cases: CASES, chunker, k: 1 });

    assert.equal(result.llmRelevance, undefined);
  });

  it("onCase 每条样本回调一次，带序号和 id", async () => {
    const seen: Array<[number, number, string]> = [];
    await evaluateRag({
      documents: DOCUMENTS,
      cases: CASES,
      chunker,
      k: 1,
      onCase: (index, total, caseId) => seen.push([index, total, caseId]),
    });

    assert.deepEqual(seen, [[1, 1, "q1"]]);
  });
});

describe("withEmbeddingCache", () => {
  it("相同文本命中缓存，不同文本各自计算", async () => {
    const computed: string[] = [];
    const cached = withEmbeddingCache(async (text: string) => {
      computed.push(text);
      return [text.length];
    });

    await cached("甲");
    await cached("甲");
    await cached("乙");

    assert.deepEqual(computed, ["甲", "乙"]);
  });
});
