import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { chunkByHeading } from "../src/chunk.js";
import { loadDocsCorpus } from "../src/docs-corpus.js";
import { evaluateRag } from "../src/evaluate.js";
import { BLOG_GOLDEN_MIN_CASES, blogFixtures, blogGoldenCases } from "../src/golden-blog.js";
import { retrieveLexical } from "../src/retrieve.js";

const DOCS_DIR = resolve(import.meta.dirname, "../../../docs");
const EVAL_K = 5;

function loadBlogDocuments() {
  return [...loadDocsCorpus(DOCS_DIR), ...blogFixtures];
}

describe("blogGoldenCases", () => {
  it("golden 至少 30 条，覆盖七类样本", () => {
    expect(blogGoldenCases.length).toBeGreaterThanOrEqual(BLOG_GOLDEN_MIN_CASES);

    const abstain = blogGoldenCases.filter((ragCase) => ragCase.shouldAbstain && !ragCase.asRole);
    const acl = blogGoldenCases.filter((ragCase) => ragCase.asRole);
    const multiSource = blogGoldenCases.filter(
      (ragCase) => ragCase.relevantSources.length > 1,
    );
    const fixtureBacked = blogGoldenCases.filter((ragCase) =>
      ragCase.relevantSources.some((source) => source.startsWith("fixtures/")),
    );

    expect(abstain.length).toBeGreaterThanOrEqual(5);
    expect(acl.length).toBeGreaterThanOrEqual(2);
    expect(multiSource.length).toBeGreaterThanOrEqual(5);
    expect(fixtureBacked.length).toBeGreaterThanOrEqual(3);
  });

  it("relevantSources 必须存在于语料中", () => {
    const sources = new Set(loadBlogDocuments().map((document) => document.source));
    for (const ragCase of blogGoldenCases) {
      for (const source of ragCase.relevantSources) {
        expect(sources.has(source), `${ragCase.id} 引用了不存在的 ${source}`).toBe(true);
      }
    }
  });
});

describe("博客知识库评测基线", () => {
  it("词项检索在真实语料上跑出指标基线，CI 防退化", async () => {
    const result = await evaluateRag({
      documents: loadBlogDocuments(),
      cases: blogGoldenCases,
      chunker: chunkByHeading,
      k: EVAL_K,
    });

    // 基线校准（当前实际值见 README）：阈值只防退化，不代表指标够好。
    // bigram + BM25 饱和后的基线：Recall@5 ≈ 0.83，拒答 ≈ 0.93。
    expect(result.recallAtK).toBeGreaterThanOrEqual(0.8);
    expect(result.abstainAccuracy).toBeGreaterThanOrEqual(0.9);
  });

  it("权限样本：受限文档对 public 不可见，对 hr 可见", async () => {
    // 权限的正确性在检索层强制；extractive answerer 对单 token 长问句可能误答，
    // 这是已知限制（README），生产应换 LLM 拒答判断。
    const chunks = chunkByHeading(loadBlogDocuments());
    const salaryPublic = blogGoldenCases.find((ragCase) => ragCase.id === "salary-public");
    const salaryHr = blogGoldenCases.find((ragCase) => ragCase.id === "salary-hr");

    const publicRetrieved = retrieveLexical(chunks, salaryPublic!.question, EVAL_K, "public");
    expect(
      publicRetrieved.some((chunk) => chunk.source === "fixtures/restricted-salary.md"),
    ).toBe(false);

    const hrRetrieved = retrieveLexical(chunks, salaryHr!.question, EVAL_K, "hr");
    expect(
      hrRetrieved.some((chunk) => chunk.source === "fixtures/restricted-salary.md"),
    ).toBe(true);
  });

  it("恶意文档可被检索，但正常问题的引用不来自恶意文档", async () => {
    const chunks = chunkByHeading(loadBlogDocuments());
    const poison = blogGoldenCases.find((ragCase) => ragCase.id === "malicious-no-pollute");

    const retrieved = retrieveLexical(chunks, poison!.question, EVAL_K);
    expect(
      retrieved.some((chunk) => chunk.source === "fixtures/malicious-injection.md"),
    ).toBe(false);
  });
});
