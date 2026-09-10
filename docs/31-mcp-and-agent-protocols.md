---
title: MCP 与 Agent 协议：从 Tool 集成到可组合能力
date: 2026-08-29
isComment: true
categories:
- AI
- Agent
tags:
- MCP
- Protocol
- Tools
---

# MCP 与 Agent 协议：从 Tool 集成到可组合能力

> MCP 的价值不只是“多一个工具协议”，而是把能力提供方和 Agent 运行时之间的接口、资源和生命周期标准化。
>
> **边界：** 本篇管协议与能力发现。业务 Tool 设计见 [09](./09-tools-system-design.md)，Skills 见 [23](./23-skills-agent-bridge.md)。
>
> **配套实验：** [04 MCP 能力服务](./examples.md#04-mcp-能力服务) — 同一套业务函数经官方 SDK 被 Client 发现；含 Tool、只读 Resource、Prompt，以及 stdio / HTTP。HTTP 可用 Bearer 映射角色。

## Tool、Skills、RAG、MCP 的边界

| 机制 | 解决的问题 |
|------|------------|
| Tool | Agent 如何调用一个动作 |
| RAG | Agent 如何查询外部知识 |
| Skill | Agent 如何复用一套操作方法和约束 |
| MCP | 能力提供方如何以标准协议暴露 Tool、Resource 和 Prompt |

它们可以组合，但不能互相替代。MCP Server 仍然需要权限、超时、审计和输入校验。

## MCP 学习顺序

1. 写一个只读 Resource Server。本仓库 04 已暴露 `blog://posts/welcome`。
2. 增加带 Zod Schema 的 Tool。
3. 编写最小 Client，发现能力并调用 Tool。本仓库 04 已用内存传输、stdio 和 Streamable HTTP 跑通这一步。
4. 增加鉴权、日志、错误映射和超时。04 的 HTTP 入口可用 Bearer token 映射 reader/writer；03 的 `runTool` 可包住 MCP `callTool`。
5. 将现有 `ToolRegistry` 适配为 MCP Server。

## 设计原则

- 暴露业务能力，不暴露过大的万能接口。
- Tool 名称和参数保持稳定，兼容性优先。
- 返回结构化结果，同时提供人类可读摘要。
- 明确哪些操作只读、哪些操作有副作用。
- 不把密钥、内部路径和未脱敏数据写入返回值。
- 对 Resource 做版本和权限控制。

## MCP Server 的验收标准

- 能列出能力，并且描述与实际 Schema 一致。
- 非法参数在执行前被拒绝。
- Tool 超时不会拖死 Agent 主循环。
- 重试不会重复执行不可逆操作。
- 日志能关联用户、租户、请求和 Tool 调用。
- Server 重启后不会丢失需要持久化的业务状态。

## 从本项目开始的实践

把 [09 Tools](./09-tools-system-design.md) 中的天气、Wikipedia 或博客检索 Tool 分阶段迁移：

```text
本地函数 → ToolRegistry → MCP Server → Agent Client → 权限与审计
```

迁移过程中保持同一套业务函数和测试，协议层只负责适配，不要复制一套执行逻辑。

## 后续方向

- MCP 与 LangGraph、Mastra、AI SDK 的接入方式比较。
- 远程 MCP 的鉴权、租户隔离和部署。
- 多 Agent handoff 与 A2A 类协议的边界。
- 浏览器、文件系统、数据库等高风险能力的沙箱化。

## 与已有内容的关系

- Skills 见 [23](./23-skills-agent-bridge.md)。
- Tool 系统见 [09](./09-tools-system-design.md)。
- 开源 MCP 资源索引见 [github-ai](./github-ai.md)。
