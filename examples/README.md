# AI Lab Examples

这里收拢与文档配套的可运行实验。每个实验应保持单一主题，避免复制完整业务项目。

## 约定

每个实验目录至少包含：

```text
README.md
.env.example
src/
test/
```

README 需要说明：前置条件、启动命令、输入输出示例、模型配置、已知限制、Token/延迟/成本记录。

## 推荐建设顺序

| 目录 | 对应内容 | 验收重点 |
|------|----------|----------|
| [`01-structured-output`](./01-structured-output/README.md) | Tool Schema、Structured Output | 非法输出可恢复 |
| [`02-rag-evaluation`](./02-rag-evaluation/README.md) | RAG 数据管道与评测 | Recall@K、引用命中率 |
| [`03-reliable-agent`](./03-reliable-agent/README.md) | Agent 可靠性与安全 | 超时、重试、审批、审计 |
| [`04-mcp-server`](./04-mcp-server/README.md) | MCP 与 Agent 协议 | 能力发现、Schema、权限、只读 Resource |

实验完成后再抽取共享包，避免过早设计通用框架。
