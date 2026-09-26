---
title: 03 SDK 嵌入：createAgentSession 与自定义 provider
sidebar: auto
date: 2026-09-26
isComment: true
categories:
- AI
- Agent
tags:
- Pi
- Coding Agent
- SDK
- Ollama
---

# 03 SDK 嵌入：createAgentSession 与自定义 provider

> 前两篇讲的是 Pi 作为 CLI 的架构。这篇讲**把 Pi 当库用**：在自己的应用里嵌一个 coding agent 内核，并接到本地 Ollama。配套实验：[examples/06-pi-agent](https://github.com/jeek/ai-lab/tree/main/examples/06-pi-agent)（8 个测试，含真实 gemma4 集成）。

---

## 两种嵌入深度

| 深度 | API | 适合 |
| --- | --- | --- |
| 浅：只要 agent 循环 | `new Agent(...)`（pi-agent-core） | 自己的产品逻辑，只要「prompt→tool→loop」 |
| 深：要完整会话能力 | `createAgentSession(...)`（pi-coding-agent SDK） | 要会话持久化、Skills、运行模式 |

## 浅嵌入：pi-agent-core + Ollama

06 实验的完整接线（真实代码，测试覆盖）：

```ts
import { Agent } from "@mariozechner/pi-agent-core";

const agent = new Agent({
  initialState: {
    systemPrompt: "你是简洁的中文助手。",
    model: {
      id: "gemma4:latest",
      api: "openai-completions",      // Ollama 的 /v1 是 OpenAI 兼容端点
      provider: "ollama",
      baseUrl: "http://localhost:11434/v1",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 8192,
      maxTokens: 2048,
    },
    tools: [calcTool],
  },
});
// 坑 1：pi-ai 的 envMap 没有 ollama，不挂这个钩子会直接抛 "No API key"
agent.getApiKey = () => "ollama";

agent.subscribe((event) => {
  if (event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});
await agent.prompt("3+5 等于几？");
```

### 实测踩坑记录

| 坑 | 现象 | 解法 |
| --- | --- | --- |
| envMap 无 ollama | `No API key for provider: ollama` | `agent.getApiKey = () => "ollama"`（Ollama 服务端不校验） |
| abort 不生效 | `prompt()` 的 Promise 永不 settle | mock/自定义 streamFn 必须监听 `options.signal` 并推 `error` 事件收尾 |
| 工具结果精度 | `0.30000000000000004` 进上下文 | 工具内 `Number(value.toFixed(6))` 去浮点噪音 |
| gemma4 tool calling | 担心兼容层不支持 | 实测 OK：`tool_calls` 正常解析（见 `test/ollama-integration.test.ts`） |

### 可测试性：mock streamFn

`streamFn` 是实例钩子，测试里换成「剧本式假流」，CI 完全不依赖模型：

```ts
const scriptedStreamFn: StreamFn = () => {
  const stream = createAssistantMessageEventStream();
  queueMicrotask(() => {
    stream.push({ type: "start", partial: message });
    stream.push({ type: "done", reason: "toolUse", message });
    stream.end();
  });
  return stream;
};
```

06 实验用这招覆盖了：toolUse→执行→回传的完整 loop、abort 收尾、事件序列——全部毫秒级完成。

## 深嵌入：createAgentSession

要会话持久化、Skills、运行模式时，用 pi-coding-agent 的 SDK 入口：

```ts
import { createAgentSession, SessionManager } from "@mariozechner/pi-coding-agent";

const session = await createAgentSession({
  model,
  tools,
  sessionManager: SessionManager.inMemory(),  // 或落盘 JSONL
  authStorage,
  modelRegistry,
});

session.subscribe((event) => { /* 同一套事件流 */ });
await session.prompt("修复 src/index.ts 的类型错误");
await session.steer("先别改，给我个方案");   // 人在回路
await session.abort();
```

运行模式三选一：`InteractiveMode`（TUI）、`runPrintMode`（一次性输出，适合 CI/脚本）、`runRpcMode`（JSON-RPC，适合远程驱动）。

### 自定义 provider 注册

```ts
pi.registerProvider("my-local", {
  baseUrl: "http://localhost:11434/v1",
  api: "openai-completions",
  models: [/* Model 对象数组 */],
});
```

注册后 `my-local/gemma4:latest` 这样的模型 ID 就能在 CLI/SDK 里直接用。

## 什么时候选 Pi 做嵌入

- 产品是「agent 操作本地文件/命令」形态（IDE 插件、运维机器人、代码机器人）
- 需要白盒：事件流全暴露，UI 完全自己写
- 接受 MIT 依赖 + 跟随上游版本（0.x，API 还会动）

不适合：多 agent 编排（看 LangGraph）、纯对话产品（杀鸡用牛刀）。

---

## 小结

- 浅嵌入用 `new Agent` + 手搓 Model 对象；深嵌入用 `createAgentSession`
- 接 Ollama 两个关键点：`api: "openai-completions"` + `getApiKey` 钩子
- `streamFn` 钩子让 agent 循环可 100% 离线单测
- 06 实验是可直接抄的最小接线样板

系列目录：[Pi 深度解析](./index.md)
