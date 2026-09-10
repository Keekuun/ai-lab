# 04 MCP Server

对应 [31 MCP 与 Agent 协议](../../docs/31-mcp-and-agent-protocols.md)、[09 Tools](../../docs/09-tools-system-design.md)。

验收：Client 能发现能力且描述与 Schema 一致；非法参数在执行前拒绝；reader 不能调用 write Tool。

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

## 输入 / 输出

注册 `search_blog`（只读）和 `publish_post`（写入）。演示会列出能力，然后用空 query、reader 发文、writer 发文各打一次。

```json
{
  "discovered": ["search_blog", "publish_post"],
  "invalid": { "ok": false, "reason": "invalid_args" },
  "forbidden": { "ok": false, "reason": "forbidden" },
  "published": { "ok": true, "data": { "id": "post-1", "title": "hello" } }
}
```

## 模型配置

默认不调用模型。协议层不负责生成，只负责发现、校验和授权。

## 已知限制

- stdio 和 Streamable HTTP 已接好，不要复制一套业务 handler。HTTP 只绑 `127.0.0.1`；Bearer token 不是 OAuth。
- JSON Schema 只覆盖本实验用到的 `z.object` 字符串字段。
- 鉴权是角色枚举，不是 OAuth / 租户隔离。

## Token / 延迟 / 成本

本地演示：0 Token。
