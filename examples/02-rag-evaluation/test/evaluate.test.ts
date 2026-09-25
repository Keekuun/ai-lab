import { describe, expect, it } from "vitest";
import { answerFromChunks } from "../src/answer.js";
import { chunkByFixedSize, chunkByHeading } from "../src/chunk.js";
import { evaluateRag } from "../src/evaluate.js";
import { citationHit, mrr, precisionAtK, recallAtK } from "../src/metrics.js";
import { retrieveLexical } from "../src/retrieve.js";
import { corpus, goldenCases } from "../src/corpus.js";
import type { Chunk, RagAnswer } from "../src/types.js";

const DEFAULT_TOP_K = 2;
const TINY_CHUNK_SIZE = 12;

const lcelChunk: Chunk = {
  chunkId: "lcel.md#0",
  source: "lcel.md",
  text: "LCEL 用 pipe 组合 Runnable。",
};

const noiseChunk: Chunk = {
  chunkId: "noise.md#0",
  source: "noise.md",
  text: "pipe pipe pipe pipe",
};

describe("recallAtK", () => {
  it("相关 source 出现在前 K 个结果里记 1", () => {
    expect(recallAtK([lcelChunk, noiseChunk], ["lcel.md"], DEFAULT_TOP_K)).toBe(1);
  });

  it("相关 source 被挤出前 K 记 0", () => {
    expect(recallAtK([noiseChunk], ["lcel.md"], 1)).toBe(0);
  });
});

describe("precisionAtK", () => {
  it("前 K 个结果里相关 chunk 的占比", () => {
    expect(precisionAtK([lcelChunk, noiseChunk], ["lcel.md"], DEFAULT_TOP_K)).toBe(0.5);
  });

  it("全部相关记 1，全部无关记 0", () => {
    expect(precisionAtK([lcelChunk], ["lcel.md"], 1)).toBe(1);
    expect(precisionAtK([noiseChunk, noiseChunk], ["lcel.md"], DEFAULT_TOP_K)).toBe(0);
  });
});

describe("mrr", () => {
  it("第一个相关结果排第 1 记 1，排第 3 记 1/3", () => {
    expect(mrr([lcelChunk, noiseChunk], ["lcel.md"])).toBe(1);
    expect(mrr([noiseChunk, noiseChunk, lcelChunk], ["lcel.md"])).toBeCloseTo(1 / 3);
  });

  it("没有相关结果记 0", () => {
    expect(mrr([noiseChunk], ["lcel.md"])).toBe(0);
  });
});

describe("citationHit", () => {
  it("引用必须来自本次检索，且至少一条命中相关 source", () => {
    const answer: RagAnswer = {
      text: "LCEL 用 pipe 组合 Runnable。",
      citations: [{ source: "lcel.md", chunkId: "lcel.md#0" }],
      abstained: false,
    };

    expect(citationHit(answer, [lcelChunk], ["lcel.md"])).toBe(true);
  });

  it("模型编造未检索到的 source 不算命中", () => {
    const answer: RagAnswer = {
      text: "见官方文档。",
      citations: [{ source: "https://evil.example/lcel", chunkId: "fake" }],
      abstained: false,
    };

    expect(citationHit(answer, [lcelChunk], ["lcel.md"])).toBe(false);
  });
});

describe("answerFromChunks", () => {
  it("证据不足时拒答，且不编造引用", () => {
    const answer = answerFromChunks("NVIDIA 今日股价？", [noiseChunk]);

    expect(answer.abstained).toBe(true);
    expect(answer.citations).toEqual([]);
  });

  it("只引用检索到的 chunk，不把未召回文档写进 citations", () => {
    const answer = answerFromChunks("LCEL 是什么", [lcelChunk]);

    expect(answer.abstained).toBe(false);
    expect(answer.citations.every((citation) => citation.chunkId === "lcel.md#0")).toBe(
      true,
    );
  });
});

describe("evaluateRag", () => {
  it("按标题分块时拒答准确，切太碎后证据破碎导致误拒答", async () => {
    const heading = await evaluateRag({
      documents: corpus,
      cases: goldenCases,
      chunker: chunkByHeading,
      k: DEFAULT_TOP_K,
    });
    const tiny = await evaluateRag({
      documents: corpus,
      cases: goldenCases,
      chunker: (documents) => chunkByFixedSize(documents, TINY_CHUNK_SIZE),
      k: DEFAULT_TOP_K,
    });

    // IDF 让独特词怎么切都能召回，分块的影响体现在证据完整性上：
    // 碎片 chunk 覆盖率不足，该答的被误拒答
    expect(heading.recallAtK).toBeGreaterThanOrEqual(tiny.recallAtK);
    expect(heading.abstainAccuracy).toBeGreaterThan(tiny.abstainAccuracy);
    expect(heading.citationHitRate).toBeGreaterThan(0);
  });

  it("词频刷分：重复同一词的 chunk 排在只提一次的前面", () => {
    // IDF 相同（df 都是 2）时纯拼词频，noise 的 pipe×4 赢 lcel 的 pipe×1
    const spamChunk: Chunk = { chunkId: "spam.md#0", source: "spam.md", text: "pipe pipe pipe pipe" };
    const plainChunk: Chunk = { chunkId: "plain.md#0", source: "plain.md", text: "pipe 组合" };
    const retrieved = retrieveLexical([plainChunk, spamChunk], "pipe", DEFAULT_TOP_K);

    expect(retrieved[0]?.chunkId).toBe("spam.md#0");
  });
});
