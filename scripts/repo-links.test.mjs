import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const STALE_BRANCH = "github.com/Keekuun/ai-lab/tree/master";

function collectMarkdownFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath));
      continue;
    }
    if (entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("ai-lab 仓库链接", () => {
  it("文档不指向已不存在的 master 分支", () => {
    const docsRoot = join(import.meta.dirname, "../docs");
    const staleFiles = collectMarkdownFiles(docsRoot).filter((filePath) =>
      readFileSync(filePath, "utf8").includes(STALE_BRANCH),
    );
    assert.deepEqual(staleFiles, []);
  });
});
