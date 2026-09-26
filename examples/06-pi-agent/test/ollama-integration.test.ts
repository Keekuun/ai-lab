import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createOllamaModel, isOllamaReachable } from "../src/ollama-model.js";
import { createPiAgent } from "../src/agent.js";
import { createGetTimeTool } from "../src/tools.js";

// 真实 Ollama + gemma4 集成测试：本地有服务才跑，CI 自动跳过
const reachable = await isOllamaReachable();

describe.skipIf(!reachable)("pi + ollama 集成（真实 gemma4）", () => {
  it("模型经 openai-completions 兼容层触发工具调用并回答", async () => {
    const agent = createPiAgent({
      model: createOllamaModel(),
      tools: [createGetTimeTool()],
      systemPrompt: "你是助手。需要查时间时必须调用 get_time 工具，不要自己猜。",
    });

    const toolCalls: string[] = [];
    let finalText = "";
    agent.subscribe((event) => {
      if (event.type === "tool_execution_start") {
        toolCalls.push(event.toolName);
      }
      if (
        event.type === "message_update" &&
        event.assistantMessageEvent.type === "text_delta"
      ) {
        finalText += event.assistantMessageEvent.delta;
      }
    });

    await agent.prompt("现在几点了？");

    assert.ok(toolCalls.includes("get_time"), "应触发 get_time 工具调用");
    assert.ok(finalText.trim().length > 0, "工具结果应回传并生成最终回答");
  }, 180_000);
});
