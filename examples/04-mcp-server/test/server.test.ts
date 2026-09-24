import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createCapabilityServer } from "../src/server.js";

function createBlogServer() {
  const server = createCapabilityServer();
  let searchCalls = 0;
  let publishCalls = 0;

  server.register({
    name: "search_blog",
    description: "按关键词检索博客",
    risk: "read",
    schema: z.object({ query: z.string().min(1) }),
    handler: async (args) => {
      searchCalls += 1;
      return { hits: [args.query] };
    },
  });

  server.register({
    name: "publish_post",
    description: "发布一篇博客",
    risk: "write",
    schema: z.object({ title: z.string().min(1) }),
    handler: async (args) => {
      publishCalls += 1;
      return { id: "post-1", title: args.title };
    },
  });

  return {
    server,
    counts: () => ({ searchCalls, publishCalls }),
  };
}

describe("createCapabilityServer", () => {
  it("listCapabilities 的名称和 schema 与注册时一致", () => {
    const { server } = createBlogServer();
    const search = server.listCapabilities().find((item) => item.name === "search_blog");

    expect(search).toMatchObject({
      name: "search_blog",
      description: "按关键词检索博客",
      risk: "read",
    });
    expect(search?.inputSchema).toMatchObject({
      type: "object",
      required: ["query"],
    });
  });

  it("非法参数在 handler 执行前被拒绝", async () => {
    const { server, counts } = createBlogServer();

    const result = await server.call({
      name: "search_blog",
      args: { query: "" },
      actor: { role: "reader" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_args");
    }
    expect(counts().searchCalls).toBe(0);
  });

  it("reader 不能调用 write 能力", async () => {
    const { server, counts } = createBlogServer();

    const result = await server.call({
      name: "publish_post",
      args: { title: "hello" },
      actor: { role: "reader" },
    });

    expect(result).toMatchObject({ ok: false, reason: "forbidden" });
    expect(counts().publishCalls).toBe(0);
  });

  it("writer 可以发现并调用 write 能力", async () => {
    const { server, counts } = createBlogServer();

    const result = await server.call({
      name: "publish_post",
      args: { title: "hello" },
      actor: { role: "writer" },
    });

    expect(result).toEqual({
      ok: true,
      data: { id: "post-1", title: "hello" },
    });
    expect(counts().publishCalls).toBe(1);
  });

  it("未知能力在执行前失败", async () => {
    const { server } = createBlogServer();

    const result = await server.call({
      name: "drop_database",
      args: {},
      actor: { role: "writer" },
    });

    expect(result).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("能列出并读取已注册的只读 Resource，未知 URI 在读取前失败", async () => {
    const { server } = createBlogServer();
    server.registerResource({
      uri: "blog://posts/welcome",
      name: "welcome",
      description: "欢迎帖",
      mimeType: "text/plain",
      risk: "read",
      read: async () => "hello resource",
    });

    expect(server.listResources()).toEqual([
      {
        uri: "blog://posts/welcome",
        name: "welcome",
        description: "欢迎帖",
        mimeType: "text/plain",
        risk: "read",
      },
    ]);

    const found = await server.readResource({
      uri: "blog://posts/welcome",
      actor: { role: "reader" },
    });
    expect(found).toEqual({ ok: true, data: "hello resource" });

    const missing = await server.readResource({
      uri: "blog://posts/missing",
      actor: { role: "reader" },
    });
    expect(missing).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("能列出并渲染已注册的 Prompt，非法参数不会进 render", async () => {
    const { server } = createBlogServer();
    let renderCalls = 0;
    server.registerPrompt({
      name: "summarize_post",
      description: "总结一篇博客",
      risk: "read",
      schema: z.object({ topic: z.string().min(1) }),
      render: async (args) => {
        renderCalls += 1;
        return [{ role: "user", content: `总结：${args.topic}` }];
      },
    });

    expect(server.listPrompts()).toEqual([
      {
        name: "summarize_post",
        description: "总结一篇博客",
        risk: "read",
      },
    ]);

    const rendered = await server.getPrompt({
      name: "summarize_post",
      args: { topic: "MCP" },
      actor: { role: "reader" },
    });
    expect(rendered).toEqual({
      ok: true,
      data: { messages: [{ role: "user", content: "总结：MCP" }] },
    });
    expect(renderCalls).toBe(1);

    const invalid = await server.getPrompt({
      name: "summarize_post",
      args: { topic: "" },
      actor: { role: "reader" },
    });
    expect(invalid).toMatchObject({ ok: false, reason: "invalid_args" });
    expect(renderCalls).toBe(1);
  });

  it("handler 超过 timeoutMs 返回 timeout，不拖死调用方", async () => {
    const server = createCapabilityServer({ timeoutMs: 20 });
    server.register({
      name: "slow_search",
      description: "会卡住的检索",
      risk: "read",
      schema: z.object({ query: z.string().min(1) }),
      handler: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return { hits: [] };
      },
    });

    const startedAt = Date.now();
    const result = await server.call({
      name: "slow_search",
      args: { query: "mcp" },
      actor: { role: "reader" },
    });

    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(result).toMatchObject({ ok: false, reason: "timeout" });
  });

  it("onAudit 记录每次调用的角色、名称、耗时和结果", async () => {
    const audits: unknown[] = [];
    const server = createCapabilityServer({
      onAudit: (event) => {
        audits.push(event);
      },
    });
    server.register({
      name: "search_blog",
      description: "按关键词检索博客",
      risk: "read",
      schema: z.object({ query: z.string().min(1) }),
      handler: async (args) => ({ hits: [args.query] }),
    });
    server.register({
      name: "publish_post",
      description: "发布一篇博客",
      risk: "write",
      schema: z.object({ title: z.string().min(1) }),
      handler: async (args) => ({ id: "post-1", title: args.title }),
    });

    await server.call({
      name: "search_blog",
      args: { query: "mcp" },
      actor: { role: "reader" },
    });
    await server.call({
      name: "search_blog",
      args: { query: "" },
      actor: { role: "reader" },
    });
    await server.call({
      name: "publish_post",
      args: { title: "x" },
      actor: { role: "reader" },
    });

    expect(audits).toHaveLength(3);
    expect(audits[0]).toMatchObject({
      kind: "tool",
      name: "search_blog",
      role: "reader",
      ok: true,
    });
    expect(audits[1]).toMatchObject({
      kind: "tool",
      name: "search_blog",
      role: "reader",
      ok: false,
      reason: "invalid_args",
    });
    expect(audits[2]).toMatchObject({
      kind: "tool",
      name: "publish_post",
      role: "reader",
      ok: false,
      reason: "forbidden",
    });
    for (const event of audits) {
      expect(typeof (event as { durationMs: number }).durationMs).toBe("number");
    }
  });
});
