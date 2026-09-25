import { describe, expect, it } from "vitest";
import { chunkByHeading } from "../src/chunk.js";
import { retrieveLexical, tokenizeBigram } from "../src/retrieve.js";
import type { Document } from "../src/types.js";

describe("tokenizeBigram", () => {
  it("中文按二字滑动窗口切分", () => {
    expect(tokenizeBigram("薪资计算")).toEqual(["薪资", "资计", "计算"]);
  });

  it("英文和数字保持整词，大小写归一", () => {
    expect(tokenizeBigram("MCP Server v2")).toEqual(["mcp", "server", "v2"]);
  });

  it("中英文混合各自切分", () => {
    expect(tokenizeBigram("用 pipe 组合")).toEqual(["用", "pipe", "组合"]);
  });
});

describe("bigram 检索", () => {
  const docs: Document[] = [
    { source: "salary.md", text: "## 薪资计算\n\n内部薪资 = base × 级别系数。" },
    { source: "rag.md", text: "## RAG\n\n检索增强生成的公开介绍。" },
  ];

  it("单字 query 能命中长词（薪资 命中 薪资计算）", () => {
    const chunks = chunkByHeading(docs);
    const retrieved = retrieveLexical(chunks, "薪资", 5);

    expect(retrieved.some((chunk) => chunk.source === "salary.md")).toBe(true);
  });

  it("长问句与文档用词不同时仍能命中共有 bigram", () => {
    const chunks = chunkByHeading(docs);
    const retrieved = retrieveLexical(chunks, "内部薪资级别系数怎么算", 5);

    expect(retrieved[0]?.source).toBe("salary.md");
  });

  it("无关 query 不得分", () => {
    const chunks = chunkByHeading(docs);
    const retrieved = retrieveLexical(chunks, "NVIDIA 今日股价", 5);

    expect(retrieved).toHaveLength(0);
  });
});
