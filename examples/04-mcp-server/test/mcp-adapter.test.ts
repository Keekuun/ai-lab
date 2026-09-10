import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { connectCapabilityOverMcp } from "../src/mcp-adapter.js";
import { createCapabilityServer } from "../src/server.js";

function createBlogCapabilities() {
  const capabilities = createCapabilityServer();
  let searchCalls = 0;

  capabilities.register({
    name: "search_blog",
    description: "按关键词检索博客",
    risk: "read",
    schema: z.object({ query: z.string().min(1) }),
    handler: async (args) => {
      searchCalls += 1;
      return { hits: [args.query] };
    },
  });
  capabilities.register({
    name: "publish_post",
    description: "发布一篇博客",
    risk: "write",
    schema: z.object({ title: z.string().min(1) }),
    handler: async (args) => ({ id: "post-1", title: args.title }),
  });

  return {
    capabilities,
    searchCalls: () => searchCalls,
  };
}

async function connectActor(role: "reader" | "writer") {
  const { capabilities, searchCalls } = createBlogCapabilities();
  const mcpServer = connectCapabilityOverMcp(capabilities, { role });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "ai-lab-test", version: "0.1.0" });
  await mcpServer.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, searchCalls };
}

describe("connectCapabilityOverMcp", () => {
  it("writer 经 MCP listTools 能看到读写两种能力", async () => {
    const { client } = await connectActor("writer");
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(["publish_post", "search_blog"]);
    await client.close();
  });

  it("reader 经 MCP 只能发现只读能力", async () => {
    const { client } = await connectActor("reader");
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(["search_blog"]);
    await client.close();
  });

  it("MCP callTool 走同一套业务 handler", async () => {
    const { client, searchCalls } = await connectActor("reader");
    const result = await client.callTool({
      name: "search_blog",
      arguments: { query: "LCEL" },
    });

    expect(searchCalls()).toBe(1);
    expect(result.isError).toBeFalsy();
    const text = Array.isArray(result.content)
      ? result.content.map((part) => ("text" in part ? part.text : "")).join("")
      : "";
    expect(text).toContain("LCEL");
    await client.close();
  });

  it("非法参数不会进业务 handler", async () => {
    const { client, searchCalls } = await connectActor("reader");
    const result = await client.callTool({
      name: "search_blog",
      arguments: { query: "" },
    });

    expect(searchCalls()).toBe(0);
    expect(result.isError).toBe(true);
    await client.close();
  });

  it("reader 经 MCP 能列出并读取只读 Resource", async () => {
    const { capabilities } = createBlogCapabilities();
    capabilities.registerResource({
      uri: "blog://posts/welcome",
      name: "welcome",
      description: "欢迎帖",
      mimeType: "text/plain",
      risk: "read",
      read: async () => "hello resource",
    });
    const mcpServer = connectCapabilityOverMcp(capabilities, { role: "reader" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "ai-lab-test", version: "0.1.0" });
    await mcpServer.connect(serverTransport);
    await client.connect(clientTransport);

    const { resources } = await client.listResources();
    expect(resources.map((resource) => resource.uri)).toEqual(["blog://posts/welcome"]);

    const read = await client.readResource({ uri: "blog://posts/welcome" });
    const text = read.contents.map((part) => ("text" in part ? part.text : "")).join("");
    expect(text).toContain("hello resource");
    await client.close();
  });
});
