---
title: 02 Harness 全景与落地：四种模式、cordis.yml 与选型
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

# 02 Harness 全景与落地：四种模式、cordis.yml 与选型

> 上一篇拆了 Cordis 内核，这篇看 harness 本体：它把「模型、工具、会话、沙箱、循环、UI」全部做成可替换插件，用 `cordis.yml` 组装。信息基于 [官方文档](https://deepseek-harness.github.io/deepseek-harness/) 与仓库 README（2026-09，developer preview）。

---

## 运行方式

```bash
npx @deepseek-ai/dsh web        # Web UI（127.0.0.1:3080）

# 或从源码
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness && pnpm install && pnpm run build
pnpm dsh web
```

Python SDK（`deepseek-harness-sdk`）：

```python
with DeepSeekHarness(provider="deepseek-official", model="deepseek-v4-flash") as harness:
    result = harness.run("重构这个目录的导入")
# session_id 可复用：跨调用保持 Bash 进程等工作区状态
```

密钥存 `$DSH_HOME/.credentials.yaml`，不进代码库。

## 四种内置模式

| 模式 | 工具集 | 用途 |
| --- | --- | --- |
| Standard | 全量工具 | 日常 agent 任务 |
| Code | 模型生成代码编排多轮工具调用 | 复杂多步任务 |
| Minimal | 仅 shell + 文件编辑器 | **模型基准测试**（最小环境） |
| Creator | 检视当前运行时、内存中试插件、组合成新模式 | 开发自己的模式 |

Creator 模式最能体现设计意图：**模式本身也是插件组合的产物**，不是硬编码的产品形态。

## cordis.yml：配置即插件树

```yaml
# 概念示意（具体 schema 以仓库为准，developer preview 变动快）
plugins:
  - name: llm-deepseek
    provide: llm
    config: { provider: deepseek-official, model: deepseek-v4-flash }
  - name: tools-fs
    provide: tools
  - name: my-custom-tool
    src: ./plugins/my-tool.ts   # 自己的插件直接挂进来
```

换模型 = 换 llm 插件配置；加工具 = 挂新插件；改 loop = 换 loop 插件。**不动 harness 源码**。

## 三种 agent 框架范式对照

| | DeepSeek Harness | Pi | LangGraph |
| --- | --- | --- | --- |
| 核心抽象 | 插件总线 | 固定循环+事件 | 状态图 |
| 可替换粒度 | 一切（含 loop 本身） | 钩子级（streamFn 等） | 节点级 |
| 配置方式 | cordis.yml + TS 插件 | TS 扩展 | 代码构图 |
| 成熟度 | developer preview（破变警告） | 0.x，OpenClaw 生产在用 | 1.x 稳定 |
| 适合 | 研究 agent 运行时本身、需要换 loop/沙箱 | 嵌入自己的产品做 coding agent | 多分支复杂编排 |

## 落地建议（2026-09 现状）

- **学习/研究**：值得跟——「loop 也是插件」是目前最激进的运行时设计，07 实验的 Cordis 机制可以现在就学
- **生产使用**：等稳定版。官方明示 "THERE WILL BE COMPATIBILITY-BREAKING CHANGES"
- **写插件**：从 [Cordis tutorial](https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/) 七章入手，第 7 章直接把工具接进真实 harness 服务
- **评测场景**：Minimal 模式是现成的小环境基准，比自建评测脚手架省事

## 与本仓库实验的关系

| 实验 | 验证的 Cordis 机制 |
| --- | --- |
| [07-dsh-plugin](https://github.com/Keekuun/ai-lab/tree/main/examples/07-dsh-plugin) | 服务注册、inject 依赖（PENDING→ACTIVE→级联卸载→复活）、effect 自动清理、事件 |

没有跑 harness 本体的原因：developer preview 迭代快，实验锁定在相对稳定的 `@deepseek-ai/cordis@4.x` 上，harness 层等 API 稳定后再补端到端实验。

---

## 小结

- `npx @deepseek-ai/dsh web` 起 Web UI；四种模式覆盖日常/代码/基准/插件开发
- cordis.yml 组装插件树，换能力不改源码
- 当前定位：学架构思想 + 写 Cordis 插件，生产等稳定版

系列目录：[DeepSeek Harness](./index.md)
