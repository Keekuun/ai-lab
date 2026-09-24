import { describe, expect, it } from "vitest";
import { chunkByHeading } from "../src/chunk.js";
import { retrieveHybrid, retrieveLexical } from "../src/retrieve.js";
import type { Chunk, Document } from "../src/types.js";

const RESTRICTED_DOC: Document = {
  source: "restricted-salary.md",
  text: "## 薪资计算\n\n内部薪资 = base × 系数，仅限 HR 可见。",
  visibility: ["hr"],
};

const PUBLIC_DOC: Document = {
  source: "public-rag.md",
  text: "## RAG\n\n检索增强生成的公开介绍。",
};

function fakeEmbed(): Promise<number[]> {
  return Promise.resolve([1, 0]);
}

describe("权限过滤", () => {
  it("chunker 透传文档的 visibility 到 chunk", () => {
    const chunks = chunkByHeading([RESTRICTED_DOC, PUBLIC_DOC]);
    const restricted = chunks.find((chunk) => chunk.source === "restricted-salary.md");
    const pub = chunks.find((chunk) => chunk.source === "public-rag.md");

    expect(restricted?.visibility).toEqual(["hr"]);
    expect(pub?.visibility).toBeUndefined();
  });

  it("词项检索按 visibleTo 过滤受限 chunk", () => {
    const chunks = chunkByHeading([RESTRICTED_DOC, PUBLIC_DOC]);

    const asPublic = retrieveLexical(chunks, "薪资", 5, "public");
    expect(asPublic.some((chunk) => chunk.source === "restricted-salary.md")).toBe(false);

    const asHr = retrieveLexical(chunks, "薪资", 5, "hr");
    expect(asHr.some((chunk) => chunk.source === "restricted-salary.md")).toBe(true);
  });

  it("不传 visibleTo 时只看得到无限制文档", () => {
    const chunks = chunkByHeading([RESTRICTED_DOC, PUBLIC_DOC]);
    const anonymous = retrieveLexical(chunks, "薪资", 5);

    expect(anonymous.some((chunk) => chunk.source === "restricted-salary.md")).toBe(false);
  });

  it("混合检索同样按 visibleTo 过滤", async () => {
    const chunks = chunkByHeading([RESTRICTED_DOC, PUBLIC_DOC]);

    const asPublic = await retrieveHybrid(chunks, "薪资", 5, fakeEmbed, "public");
    expect(asPublic.some((chunk) => chunk.source === "restricted-salary.md")).toBe(false);

    const asHr = await retrieveHybrid(chunks, "薪资", 5, fakeEmbed, "hr");
    expect(asHr.some((chunk) => chunk.source === "restricted-salary.md")).toBe(true);
  });

  it("visibility 为数组时任一角色匹配即可见", () => {
    const multiRole: Chunk[] = [
      { chunkId: "x#0", source: "x.md", text: "薪资 系数", visibility: ["hr", "finance"] },
    ];

    expect(retrieveLexical(multiRole, "薪资", 5, "finance")).toHaveLength(1);
    expect(retrieveLexical(multiRole, "薪资", 5, "public")).toHaveLength(0);
  });
});
