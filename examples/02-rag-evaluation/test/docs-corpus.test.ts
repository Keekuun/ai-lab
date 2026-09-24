import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadDocsCorpus } from "../src/docs-corpus.js";

const DOCS_DIR = resolve(import.meta.dirname, "../../../docs");

describe("loadDocsCorpus", () => {
  it("递归加载主线与子系列文章，source 用相对路径", () => {
    const documents = loadDocsCorpus(DOCS_DIR);
    const sources = documents.map((document) => document.source);

    expect(sources).toContain("29-rag-data-and-evaluation.md");
    expect(sources).toContain("langchain/01-runnable-lcel.md");
    expect(sources).toContain("langgraph/08-human-in-the-loop.md");
    expect(sources).toContain("mastra/02-agents-api.md");
    expect(documents.length).toBeGreaterThan(60);
  });

  it("去掉 frontmatter，跳过导航页", () => {
    const documents = loadDocsCorpus(DOCS_DIR);

    for (const document of documents) {
      expect(document.text.startsWith("---")).toBe(false);
    }
    const sources = documents.map((document) => document.source);
    expect(sources).not.toContain("index.md");
    expect(sources).not.toContain("langchain/index.md");
    expect(sources).not.toContain("examples.md");
  });
});
