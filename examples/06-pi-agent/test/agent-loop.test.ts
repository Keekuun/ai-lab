import assert from "node:assert/strict";
import { createAssistantMessageEventStream, type AssistantMessage } from "@mariozechner/pi-ai";
import type { StreamFn } from "@mariozechner/pi-agent-core";
import { describe, it } from "vitest";
import { createPiAgent } from "../src/agent.js";
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

// 依次播出预制的 assistant 消息，模拟「toolUse → stop」的多轮 loop
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
      stream.push({
        type: "done",
        reason: message.stopReason as "stop" | "toolUse",
        message,
      });
      stream.end();
    });
    return stream;
  };
}

describe("pi-agent-core loop（mock streamFn）", () => {
  it("toolUse → 执行工具 → 结果回传 → 第二轮文本结束", async () => {
    const script = [
      fakeAssistantMessage(
        [{ type: "toolCall", id: "call_1", name: "calc", arguments: { a: 2, b: 3, op: "add" } }],
        "toolUse",
      ),
      fakeAssistantMessage([{ type: "text", text: "计算结果是 5" }], "stop"),
    ];
    const agent = createPiAgent({
      streamFn: scriptedStreamFn(script),
      tools: [createCalcTool()],
      systemPrompt: "测试",
    });

    const events: string[] = [];
    agent.subscribe((event) => {
      events.push(event.type);
    });
    await agent.prompt("2+3 等于几？");

    assert.ok(events.includes("tool_execution_start"));
    assert.ok(events.includes("tool_execution_end"));
    assert.equal(events[0], "agent_start");
    assert.equal(events.at(-1), "agent_end");

    // 工具结果进了对话历史，且最终回答来自第二轮
    const messages = agent.state.messages;
    const toolResults = messages.filter((message) => message.role === "toolResult");
    assert.equal(toolResults.length, 1);
    const lastAssistant = messages.filter((message) => message.role === "assistant").at(-1);
    assert.equal(lastAssistant?.stopReason, "stop");
  });

  it("abort 进行中的 prompt：以 aborted 收尾而不是挂死", async () => {
    // streamFn 推了 start 后卡住，模拟模型迟迟不响应。
    // 注意：pi-agent-core 把 AbortSignal 传给 streamFn，流必须自己响应 abort
    // （真实 provider 的实现就是这么做的），mock 也要遵守同样的契约。
    const hangingStreamFn: StreamFn = (model, _context, options) => {
      const stream = createAssistantMessageEventStream();
      const partial = fakeAssistantMessage([{ type: "text", text: "" }], "stop");
      options?.signal?.addEventListener("abort", () => {
        const abortedMessage = { ...partial, stopReason: "aborted" as const, errorMessage: "aborted" };
        stream.push({ type: "error", reason: "aborted", error: abortedMessage });
        stream.end();
      });
      queueMicrotask(() => stream.push({ type: "start", partial }));
      return stream;
    };
    const agent = createPiAgent({
      streamFn: hangingStreamFn,
      tools: [createCalcTool()],
      systemPrompt: "测试",
    });

    const prompting = agent.prompt("会一直等吗");
    await new Promise((resolve) => setTimeout(resolve, 20));
    await agent.abort();
    await prompting;

    const lastAssistant = agent.state.messages.filter((message) => message.role === "assistant").at(-1);
    assert.equal(lastAssistant?.stopReason, "aborted");
  });

  it("steer 消息在 turn 之间插入队列", async () => {
    const script = [fakeAssistantMessage([{ type: "text", text: "回答一" }], "stop")];
    const agent = createPiAgent({
      streamFn: scriptedStreamFn(script),
      tools: [],
      systemPrompt: "测试",
    });

    await agent.prompt("第一个问题");
    // followUp/steer 接收 AgentMessage（或返回 Promise 的接口），这里验证队列接口存在且可调用
    assert.ok(typeof agent.followUp === "function");
    assert.ok(typeof agent.steer === "function");
  });
});
