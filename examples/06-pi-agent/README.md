# 06-pi-agent：pi-agent-core + Ollama 最小嵌入

用 [Pi](https://pi.dev) 的 agent 内核（`@mariozechner/pi-agent-core`）接本地 Ollama（gemma4），跑通「prompt → 工具调用 → 结果回传 → 流式回答」的完整循环。

对应文档：[docs/pi-ai 系列](../../docs/pi-ai/index.md)

## 运行

```bash
# 前置：Ollama 服务在跑（brew services start ollama），已拉 gemma4
pnpm --filter @ai-lab/06-pi-agent test     # 8 个测试：mock 单测 + 真实 gemma4 集成（不可达自动跳过）
pnpm --filter @ai-lab/06-pi-agent start    # 交互 CLI，/quit 退出，/abort 中断
pnpm --filter @ai-lab/06-pi-agent start -- --model gemma4:31b
```

## 结构

| 文件 | 职责 |
| --- | --- |
| `src/ollama-model.ts` | 手搓 `Model<"openai-completions">` 对象指向 Ollama `/v1`；`isOllamaReachable` 探测 |
| `src/tools.ts` | `calc`（结构化参数，无 eval）与 `get_time`（可注入时钟） |
| `src/agent.ts` | `createPiAgent`：`new Agent` + `getApiKey` 占位钩子（pi-ai envMap 无 ollama） |
| `src/session.ts` | `createPiSession`：pi-coding-agent `createAgentSession` 深嵌入（会话持久化/Skills/steer），临时 agentDir + 内存 AuthStorage/ModelRegistry 隔离 |
| `src/cli.ts` | readline 交互，事件流驱动输出 |
| `test/agent-loop.test.ts` | mock `streamFn` 剧本式假流：toolUse loop、abort 收尾、事件序列 |
| `test/session.test.ts` | session 层深嵌入：工具循环、customTools 注册、多轮会话累积 |
| `test/ollama-integration.test.ts` | 真实 gemma4 工具调用（`describe.skipIf` 保护 CI） |

## 验收重点

- 工具调用 loop：toolUse → 执行 → toolResult 回传 → 第二轮文本结束
- abort 契约：streamFn 必须监听 `options.signal` 并推 `error` 事件，否则 prompt 永不 settle
- 离线可测：`streamFn` 实例钩子注入假流，单测毫秒级、不依赖模型
- 深嵌入（session 层）额外两坑：凭证校验走 `modelRegistry.getApiKeyAndHeaders`（要 `authStorage.setRuntimeApiKey`，不看 agent 钩子）；mock 时必须 `setCompactionEnabled(false)`（compaction 走真实模型调用，不经 streamFn，假 provider 下挂死）
