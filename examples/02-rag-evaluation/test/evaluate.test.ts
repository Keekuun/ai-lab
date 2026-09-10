import { describe, expect, it } from "vitest";
import { answerFromChunks } from "../src/answer.js";
import { chunkByFixedSize, chunkByHeading } from "../src/chunk.js";
import { evaluateRag } from "../src/evaluate.js";
import { citationHit, recallAtK } from "../src/metrics.js";
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
  it("按标题分块时，LCEL 问题的 Recall@2 高于过碎的固定长度分块", async () => {
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

    expect(heading.recallAtK).toBeGreaterThan(tiny.recallAtK);
    expect(heading.citationHitRate).toBeGreaterThan(0);
    expect(heading.abstainAccuracy).toBe(1);
  });

  it("词项检索会把重复噪声块排到 LCEL 文档前面", () => {
    const tinyChunks = chunkByFixedSize(corpus, TINY_CHUNK_SIZE);
    const retrieved = retrieveLexical(tinyChunks, "LCEL 是什么 pipe", DEFAULT_TOP_K);

    expect(retrieved.every((chunk) => chunk.source === "noise.md")).toBe(true);
  });
});
