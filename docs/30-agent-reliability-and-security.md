---
title: Agent 可靠性与安全：让自动执行变得可控
date: 2026-08-29
isComment: true
categories:
- AI
- Agent
tags:
- Agent
- Security
- Reliability
---

# Agent 可靠性与安全：让自动执行变得可控

> Agent 的难点不是让模型多调用几个 Tool，而是让每一次调用都有边界、可恢复、可审计。
>
> **边界：** 本篇管运行时护栏和注入威胁模型。Tool 业务设计见 [09](./09-tools-system-design.md)，上线勾选表见 [18](./18-agent-production-checklist.md)。
>
> **配套实验：** [03 可靠 Agent](./examples.md#03-可靠-agent) — 超时、重试、审批、熔断、输出截断、账本落盘、预算、dry-run、20 条注入/越权样本回归；MCP Tool 也走同一套护栏。

## 先区分三类系统

| 类型 | 特征 | 优先方案 |
|------|------|----------|
| 固定流程 | 步骤和分支已知 | 普通函数或 Workflow |
| 半开放任务 | 有少量决策和工具 | Router + 有限 Tool |
| 开放任务 | 路径无法预先枚举 | Agent，但必须有预算和审批 |

能用确定性流程解决的问题，不要交给开放式 Agent。

## 可靠性护栏

- 每次运行有最大步骤、最大耗时和最大成本。
- 外部 Tool 设置超时、重试和熔断。
- 有副作用的 Tool 必须幂等，并支持 dry-run。
- 失败状态要持久化，允许从最近节点恢复。
- Tool 输出限制长度，避免上下文膨胀。
- 并行调用要限制并发，避免触发供应商限流。
- 所有模型、工具和 Prompt 版本写入 Trace。

## 权限模型

建议把“模型可以请求什么”和“运行时允许做什么”分成两层：

```text
模型提出 tool_call
  → Schema 校验
  → 用户/租户权限校验
  → 风险等级判断
  → 必要时人工审批
  → 执行并记录审计日志
```

不要把 `description` 当作权限控制。模型看到某个 Tool，不代表它应该有权调用该 Tool。

## Prompt Injection 的正确防线

删除 `ignore previous instructions` 等字符串不能解决注入。更可靠的策略是：

1. 将外部内容标记为不可信数据。
2. 系统指令、用户输入、检索内容和 Tool 结果分离传递。
3. Tool 使用 allowlist 和最小权限。
4. 对高风险操作要求用户确认。
5. 用攻击样本集持续做安全回归。

## 威胁模型清单

- 恶意用户要求泄露系统 Prompt 或密钥。
- 恶意网页诱导 Agent 调用危险 Tool。
- 文档中嵌入“忽略之前指令”的间接注入。
- 文件、URL、SQL 参数导致越权或 SSRF。
- 多租户之间发生检索、缓存或 Checkpoint 串数据。
- Trace、日志和错误堆栈保存了 PII 或凭据。

## 安全 Eval

安全测试不能只断言“不包含 `sk-`”。应记录攻击类别、是否执行了危险 Tool、是否泄露数据、是否正确要求审批，以及拒答后的用户体验。

## 实践任务

1. 给博客助手的 Tool 分为只读、低风险写入、高风险操作三类。
2. 为每类 Tool 增加超时、审计日志和权限检查。
3. 建立 20 条 Prompt Injection 和越权样本，并纳入 CI。
4. 模拟一次 Tool 失败和一次服务重启，验证任务可恢复且不会重复扣款或发信。

## 与已有内容的关系

- Tool 设计见 [09](./09-tools-system-design.md)。
- 生产清单见 [18](./18-agent-production-checklist.md)。
- LangGraph 人机协同见 [LG08](./langgraph/08-human-in-the-loop.md)。
- Memory 中的 PII 处理见 [13](./13-advanced-memory.md)。
