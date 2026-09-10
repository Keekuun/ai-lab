import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createBlogCapabilities } from "./blog-capabilities.js";
import { connectCapabilityOverMcp } from "./mcp-adapter.js";

const server = createBlogCapabilities();

const discovered = server.listCapabilities();
const invalid = await server.call({
  name: "search_blog",
  args: { query: "" },
  actor: { role: "reader" },
});
const forbidden = await server.call({
  name: "publish_post",
  args: { title: "hello" },
  actor: { role: "reader" },
});
const published = await server.call({
  name: "publish_post",
  args: { title: "hello" },
  actor: { role: "writer" },
});

const mcpServer = connectCapabilityOverMcp(server, { role: "writer" });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const mcpClient = new Client({ name: "ai-lab-04-cli", version: "0.1.0" });
await mcpServer.connect(serverTransport);
await mcpClient.connect(clientTransport);
const listed = await mcpClient.listTools();
const listedResources = await mcpClient.listResources();
const listedPrompts = await mcpClient.listPrompts();
const searched = await mcpClient.callTool({
  name: "search_blog",
  arguments: { query: "LCEL" },
});
const welcome = await mcpClient.readResource({ uri: "blog://posts/welcome" });
const summarized = await mcpClient.getPrompt({
  name: "summarize_post",
  arguments: { topic: "MCP" },
});
await mcpClient.close();

console.error("同一套业务函数：本地校验后，再经官方 MCP SDK 被 Client 发现和调用。stdio 见 src/stdio.ts，HTTP 见 src/http.ts。");
console.log(
  JSON.stringify(
    {
      discovered: discovered.map((item) => item.name),
      resources: server.listResources().map((item) => item.uri),
      prompts: server.listPrompts().map((item) => item.name),
      invalid,
      forbidden,
      published,
      mcpTools: listed.tools.map((tool) => tool.name),
      mcpResources: listedResources.resources.map((item) => item.uri),
      mcpPrompts: listedPrompts.prompts.map((item) => item.name),
      mcpSearch: searched,
      mcpWelcome: welcome,
      mcpSummarize: summarized,
    },
    null,
    2,
  ),
);
