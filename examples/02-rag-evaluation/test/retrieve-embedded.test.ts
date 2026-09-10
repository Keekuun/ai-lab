import { describe, expect, it } from "vitest";
import { chunkByHeading } from "../src/chunk.js";
import { corpus, goldenCases } from "../src/corpus.js";
import { evaluateRag } from "../src/evaluate.js";
import { cosineSimilarity, retrieveEmbedded } from "../src/retrieve.js";

const LCEL_VECTOR = [1, 0];
const NOISE_VECTOR = [0, 1];
const OTHER_VECTOR = [0.2, 0.2];

function fakeEmbed(text: string): Promise<number[]> {
  if (text.includes("LCEL") || text.includes("Runnable")) {
    return Promise.resolve(LCEL_VECTOR);
  }
  if (text.includes("pipe pipe") || text.includes("闲聊")) {
    return Promise.resolve(NOISE_VECTOR);
  }
  return Promise.resolve(OTHER_VECTOR);
}

describe("cosineSimilarity", () => {
  it("相同向量相似度为 1", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
  });

  it("正交向量相似度为 0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
});

describe("retrieveEmbedded", () => {
  it("用注入的 embedder 把 LCEL 问句排到噪声前面", async () => {
    const chunks = chunkByHeading(corpus);
    const retrieved = await retrieveEmbedded(chunks, "LCEL 是什么", 1, fakeEmbed);

    expect(retrieved).toHaveLength(1);
    expect(retrieved[0]?.source).toBe("lcel.md");
  });
});

describe("evaluateRag with retrieve", () => {
  it("评测必须走传入的 retrieve，而不是暗中用词项检索", async () => {
    const result = await evaluateRag({
      documents: corpus,
      cases: goldenCases,
      chunker: chunkByHeading,
      k: 2,
      retrieve: async (chunks, _query, k) =>
        chunks.filter((chunk) => chunk.source === "weather.md").slice(0, k),
    });

    expect(result.recallAtK).toBe(0.5);
  });

  it("注入 embedding 检索后，同一组 golden 仍能召回 LCEL", async () => {
    const result = await evaluateRag({
      documents: corpus,
      cases: goldenCases,
      chunker: chunkByHeading,
      k: 2,
      retrieve: (chunks, query, k) => retrieveEmbedded(chunks, query, k, fakeEmbed),
    });

    expect(result.recallAtK).toBe(1);
    expect(result.abstainAccuracy).toBe(1);
  });
});
