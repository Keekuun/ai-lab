import { describe, expect, it } from "vitest";
import { chunkByFixedSize, chunkByHeading } from "../src/chunk.js";
import { corpus } from "../src/corpus.js";
import { retrieveHybrid, retrieveLexical } from "../src/retrieve.js";
import type { Chunk } from "../src/types.js";

const TINY_CHUNK_SIZE = 12;
const DEFAULT_TOP_K = 2;

function fakeEmbed(text: string): Promise<number[]> {
  if (text.includes("LCEL") || text.includes("Runnable")) {
    return Promise.resolve([1, 0]);
  }
  if (text.includes("pipe pipe") || text.includes("闲聊")) {
    return Promise.resolve([0, 1]);
  }
  return Promise.resolve([0.2, 0.2]);
}

describe("retrieveHybrid", () => {
  it("两路都排第一的 chunk 赢过只在单路排第一的", async () => {
    const chunkA: Chunk = { chunkId: "a.md#0", source: "a.md", text: "alpha 苹果" };
    const chunkB: Chunk = { chunkId: "b.md#0", source: "b.md", text: "alpha" };
    const chunkC: Chunk = { chunkId: "c.md#0", source: "c.md", text: "香蕉" };
    // 词项排名：A > B（C 无命中）；向量排名：C > A > B
    const embed = (text: string): Promise<number[]> => {
      if (text.includes("香蕉") || text.includes("查询")) {
        return Promise.resolve([0, 1]);
      }
      if (text.includes("苹果")) {
        return Promise.resolve([0.5, 0.5]);
      }
      return Promise.resolve([0.1, 0.1]);
    };

    const retrieved = await retrieveHybrid([chunkA, chunkB, chunkC], "alpha 查询", 1, embed);

    expect(retrieved[0]?.chunkId).toBe("a.md#0");
  });

  it("切太碎时词项 Top-2 全是噪声，混合检索能捞回 LCEL", async () => {
    const tinyChunks = chunkByFixedSize(corpus, TINY_CHUNK_SIZE);
    const lexicalOnly = retrieveLexical(tinyChunks, "LCEL 是什么 pipe", DEFAULT_TOP_K);
    expect(lexicalOnly.every((chunk) => chunk.source === "noise.md")).toBe(true);

    const hybrid = await retrieveHybrid(
      tinyChunks,
      "LCEL 是什么 pipe",
      DEFAULT_TOP_K,
      fakeEmbed,
    );

    expect(hybrid.some((chunk) => chunk.source === "lcel.md")).toBe(true);
  });

  it("按标题分块时混合检索与词项检索都能召回 LCEL", async () => {
    const headingChunks = chunkByHeading(corpus);
    const hybrid = await retrieveHybrid(
      headingChunks,
      "LCEL 是什么",
      DEFAULT_TOP_K,
      fakeEmbed,
    );

    expect(hybrid.some((chunk) => chunk.source === "lcel.md")).toBe(true);
  });
});
