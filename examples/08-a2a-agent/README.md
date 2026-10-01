# 08-a2a-agent：A2A v1.0 最小 agent 与内存客户端

用官方 [`@a2a-js/sdk`](https://www.npmjs.com/package/@a2a-js/sdk)（1.3.0）实现的最小 A2A 计算器 agent：AgentCard 发现、SendMessage/GetTask/CancelTask、任务生命周期事件。

对应文档：[docs/33 A2A 与 Agent 互联](../../docs/33-a2a-agent-to-agent-protocol.md)

## 运行

```bash
pnpm --filter @ai-lab/08-a2a-agent test    # 7 个测试
pnpm --filter @ai-lab/08-a2a-agent start   # CLI 演示五个环节
```

## 结构

| 文件 | 职责 |
| --- | --- |
| `src/agent-card.ts` | v1.0 AgentCard：`supportedInterfaces[]`（url/binding/version 移入每项）、capabilities、skills |
| `src/executor.ts` | `AgentExecutor`：task(submitted) → statusUpdate(working) → statusUpdate(completed+message) → finished |
| `src/server.ts` | `DefaultRequestHandler` + `JsonRpcTransportHandler`，内存可调用 |
| `src/client.ts` | 内存 client：JSON-RPC 直喂 transport；枚举规范化（`TASK_STATE_COMPLETED` → `completed`） |
| `test/a2a.test.ts` | AgentCard 结构、任务生命周期、多轮 contextId、两类取消错误 |

## 验收重点

- SDK 内部是 ts-proto 形态：枚举用 `TaskState.TASK_STATE_COMPLETED`（数字），Part 是 oneof `{ content: { $case: "text", value } }`；JSON 边界才出现字符串
- proto3 optional 字段类型声明不带 `| undefined` 但运行时可缺省：`undefined!` 标记
- v1.0 请求枚举用 proto 名（`"ROLE_USER"`），响应是 oneof 包装 `{ task } / { message }`
- 错误语义：取消不存在任务 → TaskNotFound；取消终态任务 → TaskNotCancelable
