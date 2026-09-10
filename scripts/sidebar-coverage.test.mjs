import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractSidebarLinks,
  findUnlistedPages,
  markdownPathToRoute,
} from "./sidebar-coverage.mjs";

describe("markdownPathToRoute", () => {
  it("把 docs/index.md 映射成 /", () => {
    assert.equal(markdownPathToRoute("docs/index.md"), "/");
  });

  it("把专系列 index 映射成带尾斜杠的目录", () => {
    assert.equal(markdownPathToRoute("docs/langchain/index.md"), "/langchain/");
  });

  it("把普通文章映射成去后缀路径", () => {
    assert.equal(
      markdownPathToRoute("docs/03-llm-comparison-guide.md"),
      "/03-llm-comparison-guide",
    );
  });
});

describe("extractSidebarLinks", () => {
  it("从 VitePress config 文本里取出 link", () => {
    const config = `
      sidebar: {
        '/': [{ items: [{ text: '首页', link: '/' }] }],
        '/langchain/': [{ text: '专系列', link: '/langchain/' }],
      }
    `;
    const links = extractSidebarLinks(config);
    assert.equal(links.has("/"), true);
    assert.equal(links.has("/langchain/"), true);
  });
});

describe("findUnlistedPages", () => {
  it("找出没有进侧栏的页面", () => {
    const missing = findUnlistedPages(["/", "/examples", "/ghost"], new Set(["/", "/examples"]));
    assert.deepEqual(missing, ["/ghost"]);
  });

  it("目录尾斜杠与无斜杠视为同一页", () => {
    const missing = findUnlistedPages(["/langchain/"], new Set(["/langchain"]));
    assert.deepEqual(missing, []);
  });

  it("allowlist 中的页面不报错", () => {
    const missing = findUnlistedPages(["/secret"], new Set(["/"]), new Set(["/secret"]));
    assert.deepEqual(missing, []);
  });
});
