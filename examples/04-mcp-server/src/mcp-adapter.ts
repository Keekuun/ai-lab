import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import { canCall, type ActorRole, type createCapabilityServer } from "./server.js";

const SERVER_NAME = "ai-lab-04-mcp";
const SERVER_VERSION = "0.1.0";

export function connectCapabilityOverMcp(
  capabilities: ReturnType<typeof createCapabilityServer>,
  actor: { role: ActorRole },
): McpServer {
  const mcpServer = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  for (const tool of capabilities.listRegistered()) {
    if (!canCall(actor.role, tool.risk)) {
      continue;
    }

    mcpServer.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.schema as z.ZodObject<z.ZodRawShape>,
      },
      async (args) => {
        const result = await capabilities.call({
          name: tool.name,
          args,
          actor,
        });
        if (!result.ok) {
          return {
            content: [{ type: "text", text: result.error ?? result.reason }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(result.data) }],
        };
      },
    );
  }

  for (const resource of capabilities.listResources()) {
    if (!canCall(actor.role, resource.risk)) {
      continue;
    }

    mcpServer.registerResource(
      resource.name,
      resource.uri,
      {
        description: resource.description,
        mimeType: resource.mimeType,
      },
      async (uri) => {
        const result = await capabilities.readResource({
          uri: uri.href,
          actor,
        });
        if (!result.ok) {
          throw new Error(result.error ?? result.reason);
        }
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: resource.mimeType,
              text: result.data,
            },
          ],
        };
      },
    );
  }

  return mcpServer;
}
