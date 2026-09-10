import assert from "node:assert/strict";
import type { ToolDefinition } from "./run-tool.js";

export type McpCallClient = {
  callTool: (request: {
    name: string;
    arguments?: Record<string, unknown>;
  }) => Promise<{
    isError?: boolean;
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

function textFromMcpResult(result: {
  isError?: boolean;
  content?: Array<{ type?: string; text?: string }>;
}): string {
  const text = (result.content ?? [])
    .map((part) => part.text ?? "")
    .join("");
  if (result.isError) {
    throw new Error(text || "MCP tool returned isError");
  }
  return text;
}

export function createMcpTool<T>(options: {
  client: McpCallClient;
  name: string;
  risk: ToolDefinition<T>["risk"];
  timeoutMs?: number;
  maxRetries?: number;
}): ToolDefinition<T> {
  assert(options.name.trim().length > 0, "MCP tool name 不能为空");

  return {
    name: options.name,
    risk: options.risk,
    timeoutMs: options.timeoutMs,
    maxRetries: options.maxRetries,
    execute: async (args) => {
      const result = await options.client.callTool({
        name: options.name,
        arguments: (args ?? {}) as Record<string, unknown>,
      });
      const text = textFromMcpResult(result);
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as T;
      }
    },
  };
}
