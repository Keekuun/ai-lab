import assert from "node:assert/strict";
import { createAssistantMessageEventStream, type AssistantMessage } from "@mariozechner/pi-ai";
import type { StreamFn } from "@mariozechner/pi-agent-core";
import { describe, it } from "vitest";
import { createPiSession } from "../src/session.js";
import { createCalcTool } from "../src/tools.js";

const ZERO_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function fakeAssistantMessage(
  content: AssistantMessage["content"],
  stopReason: AssistantMessage["stopReason"],
): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: "openai-completions",
    provider: "fake",
    model: "fake-model",
    usage: ZERO_USAGE,
    stopReason,
    timestamp: Date.now(),
  };
}

function scriptedStreamFn(script: AssistantMessage[]): StreamFn {
  let callIndex = 0;
  return () => {
    const message = script[Math.min(callIndex, script.length - 1)];
    callIndex += 1;
    const stream = createAssistantMessageEventStream();
    queueMicrotask(() => {
      stream.push({ type: "start", partial: message });
      for (const block of message.content) {
        if (block.type === "text") {
          stream.push({ type: "text_delta", contentIndex: 0, delta: block.text, partial: message });
        }
      }
      stream.push({ type: "done", reason: message.stopReason as "stop" | "toolUse", message });
      stream.end();
    });
    return stream;
  };
}

describe("createAgentSession 深嵌入（mock streamFn）", () => {
  it("session.prompt 走通工具循环，事件经 subscribe 流出", async () => {
    const script = [
      fakeAssistantMessage(
        [{ type: "toolCall", id: "call_1", name: "calc", arguments: { a: 6, b: 7, op: "mul" } }],
        "toolUse",
      ),
      fakeAssistantMessage([{ type: "text", text: "6×7=42" }], "stop"),
    ];
    const session = await createPiSession({
      streamFn: scriptedStreamFn(script),
      customTools: [createCalcTool()],
    });

    const events: string[] = [];
    session.subscribe((event) => {
      events.push(event.type);
    });
    await session.prompt("6*7 等于几？");

    assert.ok(events.length > 0, "应有事件流出");
    const messages = session.agent.state.messages;
    assert.ok(messages.some((message) => message.role === "toolResult"), "工具结果应入会话历史");
    const lastAssistant = messages.filter((message) => message.role === "assistant").at(-1);
    assert.equal(lastAssistant?.stopReason, "stop");
  });

  it("自定义工具经 customTools 注册并可被模型调用", async () => {
    const toolCalls: string[] = [];
    const script = [
      fakeAssistantMessage(
        [{ type: "toolCall", id: "call_1", name: "calc", arguments: { a: 1, b: 2, op: "add" } }],
        "toolUse",
      ),
      fakeAssistantMessage([{ type: "text", text: "3" }], "stop"),
    ];
    const session = await createPiSession({
      streamFn: scriptedStreamFn(script),
      customTools: [createCalcTool()],
    });
    const unsubscribe = session.agent.subscribe((event) => {
      if (event.type === "tool_execution_start") {
        toolCalls.push(event.toolName);
      }
    });

    await session.prompt("1+2");
    unsubscribe();
    assert.deepEqual(toolCalls, ["calc"]);
  });

  it("会话历史在 SessionManager 中累积（内存模式）", async () => {
    const script = [fakeAssistantMessage([{ type: "text", text: "回答" }], "stop")];
    const session = await createPiSession({
      streamFn: scriptedStreamFn(script),
      customTools: [],
    });

    await session.prompt("第一问");
    await session.prompt("第二问");

    const userMessages = session.agent.state.messages.filter((message) => message.role === "user");
    assert.equal(userMessages.length, 2, "两轮 prompt 都应保留在会话里");
  });
});
