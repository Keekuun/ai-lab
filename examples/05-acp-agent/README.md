# 05 ACP Agent

对应 [32 ACP 与编辑器协议](../../docs/32-acp-agent-client-protocol.md)、[31 MCP 与 Agent 协议](../../docs/31-mcp-and-agent-protocols.md)。

验收：initialize 完成版本与能力协商；session/prompt 流式返回 agent_message_chunk 并以 stopReason 结束；敏感操作先走 session/request_permission 再执行；session/cancel 进行中的 turn 返回 cancelled。

## 前置条件

- Node.js 22+
- 在仓库根目录执行过 `pnpm install`

默认零外部依赖：agent 本地回显。有本地 Ollama 时可让回复由 gemma4 流式生成。

## 启动

```bash
pnpm --filter @ai-lab/05-acp-agent test
pnpm --filter @ai-lab/05-acp-agent start -- --demo          # 内存流自连，打印协议消息流
pnpm --filter @ai-lab/05-acp-agent start -- --demo --ollama # demo 且回复由 gemma4 生成
pnpm --filter @ai-lab/05-acp-agent start                    # stdio 模式，等待编辑器挂载
```

在 Zed 里挂载：`settings.json` 的 `agent_servers` 加自定义 agent，命令指向 `tsx src/cli.ts`（可加 `--ollama`）。

## 结构

| 文件 | 职责 |
|------|------|
| `src/agent.ts` | 最小 ACP agent：initialize/session-new/prompt/cancel + 权限演示，`responder` 可注入 |
| `src/client.ts` | 最小 client：收集 session/update、按策略应答权限 |
| `src/cli.ts` | stdio 入口（编辑器挂载）+ `--demo` 本地自连 + `--ollama` 接 gemma4 |
| `test/helpers.ts` | 内存流对（两条 TransformStream），测试不起进程不开端口 |

## 设计要点

- **responder 注入**：`Responder = (userText, history) => AsyncIterable<string>`。测试用同步生成器，CLI 用 Ollama 流式 HTTP——协议代码与模型来源完全解耦。
- **权限演示**：用户文本命中 `修改|删除|delete|edit|write` 时，agent 先发 `tool_call`（kind: edit），再 `session/request_permission`；client 允许才报 `completed`，拒绝报 `failed` 并说明已跳过。
- **取消**：agent 为每个 turn 持有 `AbortController`，`session/cancel` 通知到达即中断流式迭代，prompt 响应 `stopReason: "cancelled"`（协议要求取消不能表现为报错）。
- **版本协商**：client 报的协议版本高于 agent 时，agent 回退到自己支持的版本（`Math.min`），这是 ACP 的强制行为。

## 已知限制

- 演示 agent 不真的读写文件；`fs/*`、`terminal/*` 等 client 能力未实现。
- `session/load`（会话恢复）未实现，能力声明 `loadSession: false`。
- ACP v2 仍是 draft，本实验基于稳定 v1（SDK 1.5.x）。
- 远程 agent（HTTP/WebSocket）协议侧仍是 WIP，本实验只覆盖 stdio/内存流。

## Token / 延迟 / 成本

默认 0 Token；`--ollama` 走本地 gemma4，0 成本。
