# 03 Reliable Agent

对应 [30 Agent 可靠性与安全](../../docs/30-agent-reliability-and-security.md)、[18 上线 Checklist](../../docs/18-agent-production-checklist.md)。

验收：Tool 超时可恢复；高风险操作要审批；同一幂等键重放不会重复扣款或发信；连续失败达到阈值后熔断，冷却期内不再执行 handler；字符串输出超过 `maxOutputChars` 被截断并标记 `truncated`；设 `LEDGER_PATH` 后账本落盘，重启进程再重放同一幂等键仍不重复扣款；预算（最大步骤/成本）耗尽后拒绝执行；`dryRun` 预览高风险操作不真执行；20 条注入/越权样本回归全过（伪造审批、越权声明被拦，注入文本只被当作数据）。

## 前置条件

- Node.js 22+
- 在仓库根目录执行过 `pnpm install`

不需要 API Key。本地假 Tool 和 MCP Tool 都走 `runTool`：超时、审批、审计同一套。

## 启动

```bash
pnpm --filter @ai-lab/03-reliable-agent test
pnpm --filter @ai-lab/03-reliable-agent start
```

## 输入 / 输出

演示依次跑：超时搜索、失败两次后恢复、未审批扣款、审批后扣款、同一 `pay-o-1` 再扣一次、连续失败后熔断，最后跑 20 条注入/越权样本回归。

```json
{
  "timeoutResult": { "ok": false, "reason": "timeout" },
  "denied": { "ok": false, "reason": "needs_approval" },
  "charges": 1,
  "circuitOpen": { "ok": false, "reason": "circuit_open" },
  "downCalls": 2,
  "budgetExceeded": { "ok": false, "reason": "budget_exceeded" },
  "budgetCalls": 0,
  "dryRunCharge": { "ok": true, "dryRun": true },
  "injectionRegression": { "total": 20, "passed": 20 }
}
```

`charges` 必须是 1。第二次扣款命中账本，不再执行 `execute`。熔断后 `downCalls` 停在 2：第三次调用被熔断器拦下，handler 没再执行。预算 `maxSteps=1` 用完后 `budgetCalls` 停在 0。dry-run 的扣款只预览不执行，`charges` 不变。注入回归按 30 的防线设计：审批只信显式 `approved` 参数，权限不看内容，工具输出只是数据——所以「文本声称已批准」「工具返回里藏指令」都不会改变护栏行为。

## 模型配置

默认不调用模型。

| 变量 | 说明 |
|------|------|
| `LEDGER_PATH` | 有值时幂等账本落盘到该 JSON 文件，重启后重放仍命中；不设则进程内 Map |

## 已知限制

- 这是单次 Tool 运行时护栏，不是完整 Agent 循环。MCP 适配只负责 `callTool`，权限仍由 `runTool` 拦。
- 审批在演示里是 `approved` 布尔值；生产应接人机确认和身份。
- 账本是 JSON 单文件同步写，无并发写保护；多实例要换数据库。
- 熔断器是单实例内存状态，多副本要外置共享状态；半开只放行一次试探，未处理并发试探。

## Token / 延迟 / 成本

本地演示：0 Token。
