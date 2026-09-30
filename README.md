# AI Lab

> AI 学习笔记与实战项目 · 站点 [ai.zkkysqs.top](https://ai.zkkysqs.top)

从 [keekuun.github.io](https://github.com/Keekuun/keekuun.github.io) 的 `docs/ai/` 迁移而来，包含 **85 篇** AI Agent / RAG / LangChain / LangGraph / Mastra / Pi / DeepSeek Harness 系列笔记。本仓库 `examples/01`～`07` 已可跑：结构化输出、RAG 评测（含本地 Ollama 全链路）、可靠 Agent、MCP 能力发现、ACP 编辑器协议、Pi agent 内核嵌入、Cordis 插件机制。

## 本地开发

```bash
pnpm install
pnpm docs:dev    # http://localhost:5173
```

## 构建

```bash
pnpm test            # 脚本检查 + 七个实验 + 侧栏覆盖
pnpm docs:build
pnpm docs:preview
```

`pnpm check:sidebar` 会拦住「写了 md 却没挂进侧栏」。PR 和 push 都会跑测试；只有 push 到 `master`/`main` 才发布站点。

> 依赖安装请用 `npx -y pnpm@9.15.0 install --filter <包名>`：仓库 lockfile 是 pnpm 9 格式，全局 pnpm 11 会改写 lockfileVersion 导致 CI `--frozen-lockfile` 失败。

## 实验

```bash
pnpm test:examples
pnpm --filter @ai-lab/01-structured-output start
pnpm --filter @ai-lab/02-rag-evaluation start
pnpm --filter @ai-lab/03-reliable-agent start
pnpm --filter @ai-lab/04-mcp-server start
pnpm --filter @ai-lab/05-acp-agent start -- --demo
pnpm --filter @ai-lab/06-pi-agent start
pnpm --filter @ai-lab/07-dsh-plugin start
```

七个实验都不填云端 Key 也能跑本地演示。02 和 06 支持接本地 Ollama（`brew services start ollama`，模型 gemma4 + bge-m3）：02 用 `--ollama` 跑真实 LLM 评测全链路，06 默认就走 Ollama 工具调用。03 的护栏也能包住 MCP Tool；04 提供内存传输、`stdio` 和 Streamable HTTP；05 演示 ACP 握手与权限；07 演示 Cordis 服务/inject/effect。站点入口见 [可运行实验](./docs/examples.md)，仓库约定见 [examples/README.md](./examples/README.md)。

## 目录

| 路径 | 说明 |
|------|------|
| `docs/` | VitePress 笔记源文件 |
| `docs/index.md` | 系列总索引 |
| `docs/langchain/` | LangChain.js 专系列（16 篇） |
| `docs/langgraph/` | LangGraph.js 专系列（13 篇） |
| `docs/mastra/` | Mastra.js 专系列（8 篇） |
| `docs/pi-ai/` | Pi 深度解析（3 篇：架构/扩展/SDK 嵌入） |
| `docs/deepseek-harness/` | DeepSeek Harness（2 篇：Cordis 插件系统/全景落地） |
| `docs/28～32` | AI 工程基础、RAG 评测、Agent 安全、MCP、ACP 专题 |
| `examples/` | 可运行实验入口，按专题与主线文章对应 |

## 关联项目

| 项目 | 仓库位置 |
|------|----------|
| blog-assistant | [keekuun.github.io/apps/blog-assistant](https://github.com/Keekuun/keekuun.github.io/tree/master/apps/blog-assistant) |
| kb-search | [keekuun.github.io/apps/kb-search](https://github.com/Keekuun/keekuun.github.io/tree/master/apps/kb-search) |

## 部署

推送到 `main` 后 GitHub Actions 自动构建并发布到 GitHub Pages。自定义域名 `ai.zkkysqs.top` 需在 Cloudflare 配置 CNAME。
