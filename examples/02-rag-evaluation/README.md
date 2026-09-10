# 02 RAG Evaluation

对应 [29 RAG 数据管道与评测](../../docs/29-rag-data-and-evaluation.md)、[11 RAG 进阶](../../docs/11-advanced-rag-patterns.md)。

验收：改分块策略后，Recall@K 和引用命中率有数字；证据不足必须拒答，引用只能来自本次检索。

## 前置条件

- Node.js 22+
- 在仓库根目录执行过 `pnpm install`

默认不需要 API Key。测试用注入的假向量；CLI 不填 Key 走词项检索，填了 `OPENAI_API_KEY` 才打 `/embeddings`。

## 启动

```bash
pnpm --filter @ai-lab/02-rag-evaluation test
pnpm --filter @ai-lab/02-rag-evaluation start
```

## 输入 / 输出

语料里有一篇真正讲 LCEL 的文档，另有一篇反复出现 `pipe` 的噪声文档。按标题切时，LCEL 还进得了 Top-2；切成 12 字碎片后，噪声块会占满 Top-2。

```json
{
  "chunker": "heading",
  "k": 2,
  "recallAtK": 1,
  "citationHitRate": 1,
  "abstainAccuracy": 1
}
```

问「NVIDIA 今日股价」时语料没有证据，必须拒答且 citations 为空。

## 模型配置

| 变量 | 说明 |
|------|------|
| `OPENAI_API_KEY` | 有值才打 embedding API |
| `OPENAI_EMBEDDING_MODEL` | 默认 `text-embedding-3-small` |
| `OPENAI_BASE_URL` | 默认 `https://api.openai.com/v1` |

## 已知限制

- 这是评测实验，不是生产向量库。
- 词项检索会放大「重复词刷分」，这是刻意用来暴露分块问题，不代表线上应只用 BM25。
- Golden 只有 2 条，用来证明指标会动；博客知识库仍需按 29 扩到 30 条。

## Token / 延迟 / 成本

本地演示：0 Token。
