---
title: Pi 深度解析：极简内核的 Coding Agent
sidebar: auto
date: 2026-09-26
isComment: true
categories:
- AI
- Agent
tags:
- Pi
- Coding Agent
- TypeScript
---

# Pi 深度解析：极简内核的 Coding Agent

> Pi 是 [OpenClaw](https://github.com/badlogic/pi-mono) 底层的 coding agent，由 Mario Zechner 开发（MIT 协议）。与「大而全」的框架相反，它的核心只有 4 个工具（read/write/edit/bash），一切复杂能力都靠 **TypeScript 扩展** 在运行时注入。本系列基于源码与 [pi.dev](https://pi.dev) 文档，拆解它的四层架构、事件驱动循环与可扩展性设计，并用 `examples/06-pi-agent` 把 pi-agent-core 接到本地 Ollama。

---

## 这套系列学什么

| 篇 | 主题 | 关键问题 |
| --- | --- | --- |
| [01 架构拆解](./01-architecture.md) | 四层 monorepo + 事件驱动 loop | pi-ai / pi-agent-core / pi-coding-agent 各管什么？事件流怎么驱动 UI？ |
| [02 可扩展性](./02-extensibility.md) | 扩展、Skills、Prompt 模板、Packages | 为什么核心可以只有 4 个工具？ |
| [03 SDK 嵌入](./03-sdk-embedding.md) | createAgentSession + 自定义 provider | 怎么把 Pi 嵌进自己的应用？怎么接 Ollama？ |

配套实验：[examples/06-pi-agent](https://github.com/jeek/ai-lab/tree/main/examples/06-pi-agent) —— 用 pi-agent-core + Ollama（gemma4）跑通「工具调用 → 结果回传 → 流式回答」的最小 agent，含 mock streamFn 的单测与真实模型集成测试。

## 为什么值得看 Pi

2025-2026 年 coding agent 爆发（Claude Code、Codex CLI、OpenClaw……），大多数是「配置驱动」：JSON/YAML 声明行为。Pi 走另一条路——**代码即配置**，扩展就是普通 TypeScript 模块，热重载、可测试、可发布成 npm 包。对前端开发者来说，这是理解「agent 内核到底需要多小」的绝佳样本。
