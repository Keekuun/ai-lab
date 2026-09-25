import { describe, expect, it } from "vitest";
import { chunkByHeading } from "../src/chunk.js";
import { corpus } from "../src/corpus.js";
import { retrieveHybrid, retrieveLexical } from "../src/retrieve.js";
import type { Chunk } from "../src/types.js";

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

  it("混合检索融合两路：词项第一和向量第一都进结果", async () => {
    // A：query 词高频（词项唯一命中）；B：向量第一，词项无命中；C：两路都无
    const chunkA: Chunk = { chunkId: "a.md#0", source: "a.md", text: "部署 部署 部署 部署" };
    const chunkB: Chunk = { chunkId: "b.md#0", source: "b.md", text: "语义相近的词" };
    const chunkC: Chunk = { chunkId: "c.md#0", source: "c.md", text: "无关 内容" };
    const embed = (text: string): Promise<number[]> =>
      Promise.resolve(text.includes("语义") || text.includes("查询") ? [1, 0] : [0, 1]);

    const lexicalOnly = retrieveLexical([chunkA, chunkB, chunkC], "部署 查询", 2);
    expect(lexicalOnly.some((chunk) => chunk.chunkId === "b.md#0")).toBe(false);

    const hybrid = await retrieveHybrid([chunkA, chunkB, chunkC], "部署 查询", 2, embed);

    expect(hybrid.some((chunk) => chunk.chunkId === "a.md#0")).toBe(true);
    expect(hybrid.some((chunk) => chunk.chunkId === "b.md#0")).toBe(true);
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
