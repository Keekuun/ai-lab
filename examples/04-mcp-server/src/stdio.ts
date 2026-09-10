import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createBlogCapabilities } from "./blog-capabilities.js";
import { connectCapabilityOverMcp } from "./mcp-adapter.js";

const actorRole = process.env.MCP_ACTOR_ROLE === "reader" ? "reader" : "writer";
const capabilities = createBlogCapabilities();
const mcpServer = connectCapabilityOverMcp(capabilities, { role: actorRole });
const transport = new StdioServerTransport();

await mcpServer.connect(transport);
