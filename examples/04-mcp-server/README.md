# 04 MCP Server

对应 [31 MCP 与 Agent 协议](../../docs/31-mcp-and-agent-protocols.md)、[09 Tools](../../docs/09-tools-system-design.md)。

验收：Client 能发现 Tool、只读 Resource 和 Prompt；非法参数在执行前拒绝；reader 不能调用 write Tool；handler 超时返回 `timeout` 不拖死调用方；每次调用写审计日志（角色、名称、耗时、结果）；同一 `idempotencyKey` 重复发布不新增；配置 `MCP_STORE_PATH` 后重启不丢帖子。

## 前置条件

- Node.js 22+
- 在仓库根目录执行过 `pnpm install`

不需要 API Key。业务函数仍在本地 `createCapabilityServer`；内存传输、stdio 和 Streamable HTTP 都走官方 `@modelcontextprotocol/sdk`。

## 启动

```bash
pnpm --filter @ai-lab/04-mcp-server test
pnpm --filter @ai-lab/04-mcp-server start
pnpm --filter @ai-lab/04-mcp-server stdio
pnpm --filter @ai-lab/04-mcp-server http
```

`stdio` 只在 stdin/stdout 上讲 MCP。日志不能打到 stdout。`http` 默认监听 `http://127.0.0.1:3333/mcp`，用 `PORT` 改端口。未配 token 时角色用 `MCP_ACTOR_ROLE=reader|writer`（默认 writer）。成对设置 `MCP_HTTP_READER_TOKEN` / `MCP_HTTP_WRITER_TOKEN` 后，每次请求必须带 `Authorization: Bearer <token>`，角色由 token 决定。Cursor / Claude 可把 `stdio` 或该 HTTP 地址配成 MCP Server。HTTP 按会话分配 `mcp-session-id`，同一进程可接多个 Client。

能力层带护栏：handler 默认 10 秒超时（`createCapabilityServer({ timeoutMs })` 可调），超时返回 `{ ok: false, reason: "timeout" }`，并通过 `ctx.signal`（AbortSignal）真正中断监听取消的 handler；每次 Tool / Resource / Prompt 调用都会触发 `onAudit` 回调，事件带 `requestId`（调用方可传入以关联上游请求），stdio 和 HTTP 入口把审计事件打到 stderr。

`publish_post` 必须带 `idempotencyKey`，同一键重复调用返回已有帖子（`deduplicated: true`），不新增。设置 `MCP_STORE_PATH=/path/posts.json` 后，发布的帖子落盘，进程重启仍能搜到。

## 输入 / 输出

注册 `search_blog`（只读）、`publish_post`（写入）、Resource `blog://posts/welcome` 和 Prompt `summarize_post`。演示会列出 Tool、Resource 和 Prompt，然后用空 query、reader 发文、writer 发文、同键重发各打一次。

```json
{
  "discovered": ["search_blog", "publish_post"],
  "resources": ["blog://posts/welcome"],
  "prompts": ["summarize_post"],
  "invalid": { "ok": false, "reason": "invalid_args" },
  "forbidden": { "ok": false, "reason": "forbidden" },
  "published": { "ok": true, "data": { "id": "post-1", "title": "LCEL 入门", "deduplicated": false } },
  "republished": { "ok": true, "data": { "id": "post-1", "title": "LCEL 入门", "deduplicated": true } }
}
```

## 模型配置

默认不调用模型。协议层不负责生成，只负责发现、校验和授权。

## 已知限制

- stdio 和 Streamable HTTP 已接好，不要复制一套业务 handler。HTTP 只绑 `127.0.0.1`；Bearer token 不是 OAuth。
- 只有监听 `ctx.signal` 的 handler 才能被真正中断；不监听的 handler 仍在后台跑完。
- 审计日志是内存回调，不是持久化 Trace；多租户字段（用户、租户 ID）还没进事件。
- 持久化是单文件 JSON，无并发写保护；多实例部署要换数据库。
- JSON Schema 只覆盖本实验用到的 `z.object` 字符串字段。
- 鉴权是角色枚举，不是 OAuth / 租户隔离。

## Token / 延迟 / 成本

本地演示：0 Token。
