---
title: 可运行实验
date: 2026-09-05
---

# 可运行实验

代码在仓库 [`examples/`](https://github.com/Keekuun/ai-lab/tree/main/examples)，每个目录只验证一件事。约定见该目录 README。

```bash
pnpm install
pnpm test:examples
```

## 建设顺序

| 目录 | 对应文章 | 验收 | 状态 |
|------|----------|------|------|
| [01-structured-output](https://github.com/Keekuun/ai-lab/tree/main/examples/01-structured-output) | [09](./09-tools-system-design.md) · [28](./28-llm-engineering-foundations.md) · [LC10](./langchain/10-output-parsers.md) | 非法输出可恢复 | 可跑 |
| [02-rag-evaluation](https://github.com/Keekuun/ai-lab/tree/main/examples/02-rag-evaluation) | [29](./29-rag-data-and-evaluation.md) · [11](./11-advanced-rag-patterns.md) | Recall@K、引用命中率 | 可跑 |
| [03-reliable-agent](https://github.com/Keekuun/ai-lab/tree/main/examples/03-reliable-agent) | [30](./30-agent-reliability-and-security.md) · [18](./18-agent-production-checklist.md) | 超时、重试、审批、审计 | 可跑 |
| [04-mcp-server](https://github.com/Keekuun/ai-lab/tree/main/examples/04-mcp-server) | [31](./31-mcp-and-agent-protocols.md) · [09](./09-tools-system-design.md) | 能力发现、Schema、权限、只读 Resource | 可跑 |

## 01 结构化输出

不填 `OPENAI_API_KEY` 会走本地演示：第一次给出非法 JSON，第二次带校验错误重试后恢复。

```bash
pnpm --filter @ai-lab/01-structured-output test
pnpm --filter @ai-lab/01-structured-output start
```

## 02 RAG 评测

同一组 golden，比较「按标题切」和「切太碎」。Retrieve 可换成注入的 embedding。问股价而语料没有证据时要拒答。

```bash
pnpm --filter @ai-lab/02-rag-evaluation test
pnpm --filter @ai-lab/02-rag-evaluation start
```

## 03 可靠 Agent

演示超时、失败重试、高风险审批，以及同一幂等键不会重复扣款。MCP Tool 也走同一套 `runTool`。

```bash
pnpm --filter @ai-lab/03-reliable-agent test
pnpm --filter @ai-lab/03-reliable-agent start
```

## 04 MCP 能力服务

同一套业务函数先本地校验，再经官方 MCP SDK 被 Client 发现。`stdio` 和 `http`（默认 `http://127.0.0.1:3333/mcp`）可供 Cursor / Claude 接入。HTTP 可配 Bearer token，角色由 token 决定；reader 看不到 write 能力。只读 Resource `blog://posts/welcome` 和 Tool 走同一套权限。

```bash
pnpm --filter @ai-lab/04-mcp-server test
pnpm --filter @ai-lab/04-mcp-server start
pnpm --filter @ai-lab/04-mcp-server stdio
pnpm --filter @ai-lab/04-mcp-server http
```

实验完成后再抽取共享包，避免过早设计通用框架。
