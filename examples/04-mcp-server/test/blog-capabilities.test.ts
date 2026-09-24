import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBlogCapabilities } from "../src/blog-capabilities.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempStorePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "ai-lab-04-store-"));
  tempDirs.push(dir);
  return join(dir, "posts.json");
}

describe("createBlogCapabilities 幂等与持久化", () => {
  it("同一 idempotencyKey 重复发布返回同一篇，不新增", async () => {
    const server = createBlogCapabilities();

    const first = await server.call<{ id: string; title: string }>({
      name: "publish_post",
      args: { title: "MCP 深入", idempotencyKey: "key-1" },
      actor: { role: "writer" },
    });
    const second = await server.call<{ id: string; title: string }>({
      name: "publish_post",
      args: { title: "MCP 深入", idempotencyKey: "key-1" },
      actor: { role: "writer" },
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.data.id).toBe(first.data.id);
    }

    const search = await server.call<{ hits: string[] }>({
      name: "search_blog",
      args: { query: "MCP" },
      actor: { role: "reader" },
    });
    expect(search.ok).toBe(true);
    if (search.ok) {
      expect(search.data.hits).toEqual(["MCP 深入"]);
    }
  });

  it("配置 storePath 后重启仍能搜到已发布的帖子", async () => {
    const storePath = tempStorePath();
    const first = createBlogCapabilities({ storePath });
    const published = await first.call<{ id: string }>({
      name: "publish_post",
      args: { title: "重启不丢", idempotencyKey: "key-restart" },
      actor: { role: "writer" },
    });
    expect(published.ok).toBe(true);

    const restarted = createBlogCapabilities({ storePath });
    const search = await restarted.call<{ hits: string[] }>({
      name: "search_blog",
      args: { query: "重启" },
      actor: { role: "reader" },
    });
    expect(search.ok).toBe(true);
    if (search.ok) {
      expect(search.data.hits).toEqual(["重启不丢"]);
    }

    const republish = await restarted.call<{ id: string }>({
      name: "publish_post",
      args: { title: "重启不丢", idempotencyKey: "key-restart" },
      actor: { role: "writer" },
    });
    expect(republish.ok).toBe(true);
    if (published.ok && republish.ok) {
      expect(republish.data.id).toBe(published.data.id);
    }
  });
});
