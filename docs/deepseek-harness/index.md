---
title: DeepSeek Harness：万物皆插件的 Agent 运行时
sidebar: auto
date: 2026-09-26
isComment: true
categories:
- AI
- Agent
tags:
- DeepSeek
- Cordis
- Agent Harness
---

# DeepSeek Harness：万物皆插件的 Agent 运行时

> DeepSeek 官方 2026-08 开源的 agent harness（[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)，MIT，**developer preview，API 会破变**）。它的赌注：agent 的每一个能力——模型、工具、会话、沙箱、存储、循环、UI——都是可替换的 Cordis 插件。本系列拆解 Cordis 插件模型，并用 `examples/07-dsh-plugin` 给出可测试的最小样本。

---

## 系列内容

| 篇 | 主题 | 关键问题 |
| --- | --- | --- |
| [01 Cordis 插件系统](./01-cordis-plugin-system.md) | 服务、inject、effect、生命周期 | 「万物皆插件」具体怎么运转？ |
| [02 Harness 全景与落地](./02-harness-overview.md) | 四种模式、cordis.yml、Python SDK | 怎么用起来？和 Pi/LangGraph 怎么选？ |

配套实验：[examples/07-dsh-plugin](https://github.com/Keekuun/ai-lab/tree/main/examples/07-dsh-plugin) —— 不依赖 harness 本体，只用 `@deepseek-ai/cordis` 验证服务/inject/effect/事件四个核心机制（6 个测试 + CLI 演示）。

## 为什么关注

LangGraph 把 agent 抽象成**图**，Pi 把 agent 收敛成**固定循环+事件**，DeepSeek Harness 则抽象成**插件总线**——连 agent loop 本身都是可替换插件。三种范式对照着看，「agent 框架的本质取舍」就清晰了。
