import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const exampleRoot = fileURLToPath(new URL("..", import.meta.url));
const tsxBin = resolve(exampleRoot, "node_modules/.bin/tsx");

const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function connectStdio(role: "reader" | "writer"): Promise<Client> {
  const transport = new StdioClientTransport({
    command: tsxBin,
    args: ["src/stdio.ts"],
    cwd: exampleRoot,
    env: {
      ...getDefaultEnvironment(),
      MCP_ACTOR_ROLE: role,
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "ai-lab-04-stdio-test", version: "0.1.0" });
  await client.connect(transport);
  clients.push(client);
  return client;
}

describe("stdio MCP server", () => {
  it("writer 经 stdio listTools 能看到读写能力", async () => {
    const client = await connectStdio("writer");
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(["publish_post", "search_blog"]);
  });

  it("reader 经 stdio 只能发现只读能力，并能 callTool", async () => {
    const client = await connectStdio("reader");
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(["search_blog"]);

    const result = await client.callTool({
      name: "search_blog",
      arguments: { query: "stdio" },
    });
    expect(result.isError).toBeFalsy();
    const text = Array.isArray(result.content)
      ? result.content.map((part) => ("text" in part ? part.text : "")).join("")
      : "";
    expect(text).toContain("stdio");
  });
});
