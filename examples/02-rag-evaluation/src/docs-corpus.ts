import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { Document } from "./types.js";

const NAVIGATION_FILES = new Set(["index.md", "examples.md"]);

function collectMarkdownFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath));
    } else if (entry.endsWith(".md") && !NAVIGATION_FILES.has(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

function stripFrontmatter(markdown: string): string {
  const match = markdown.match(/^---\n[\s\S]*?\n---\n/);
  return match ? markdown.slice(match[0].length) : markdown;
}

export function loadDocsCorpus(docsDir: string): Document[] {
  assert(docsDir.trim().length > 0, "docsDir 不能为空");
  return collectMarkdownFiles(docsDir)
    .sort()
    .map((fullPath) => ({
      source: relative(docsDir, fullPath),
      text: stripFrontmatter(readFileSync(fullPath, "utf8")),
    }));
}
