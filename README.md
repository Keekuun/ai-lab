# AI Lab

> AI 学习笔记与实战项目 · 计划域名 [ai.zkkysqs.top](https://ai.zkkysqs.top)

从 [keekuun.github.io](https://github.com/Keekuun/keekuun.github.io) 的 `docs/ai/` 迁移而来，包含 **76 篇** AI Agent / RAG / LangChain / LangGraph / Mastra 系列笔记。

## 本地开发

```bash
pnpm install
pnpm docs:dev    # http://localhost:5173
```

## 构建

```bash
pnpm docs:build
pnpm docs:preview
```

## 目录

| 路径 | 说明 |
|------|------|
| `docs/` | VitePress 笔记源文件 |
| `docs/index.md` | 系列总索引 |
| `docs/langchain/` | LangChain.js 专系列（16 篇） |
| `docs/langgraph/` | LangGraph.js 专系列（13 篇） |
| `docs/mastra/` | Mastra.js 专系列（8 篇） |
| `docs/28～31` | AI 工程基础、RAG 评测、Agent 安全、MCP 专题 |
| `examples/` | 可运行实验入口，按专题与主线文章对应 |

## 关联项目

| 项目 | 仓库位置 |
|------|----------|
| blog-assistant | [keekuun.github.io/apps/blog-assistant](https://github.com/Keekuun/keekuun.github.io/tree/master/apps/blog-assistant) |
| kb-search | [keekuun.github.io/apps/kb-search](https://github.com/Keekuun/keekuun.github.io/tree/master/apps/kb-search) |

## 部署

推送到 `master` 后 GitHub Actions 自动构建并发布到 GitHub Pages。自定义域名 `ai.zkkysqs.top` 需在 Cloudflare 配置 CNAME。
