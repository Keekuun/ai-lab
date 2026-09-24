# 02 RAG Evaluation

对应 [29 RAG 数据管道与评测](../../docs/29-rag-data-and-evaluation.md)、[11 RAG 进阶](../../docs/11-advanced-rag-patterns.md)。

验收：改分块策略后，Recall@K、Precision@K、MRR 和引用命中率有数字；证据不足必须拒答，引用只能来自本次检索。

## 前置条件

- Node.js 22+
- 在仓库根目录执行过 `pnpm install`

默认不需要 API Key。测试用注入的假向量；CLI 不填 Key 走词项检索，填了 `OPENAI_API_KEY` 才打 `/embeddings`，并额外输出 词项 / 纯向量 / 混合（RRF）三种检索方案的对比。

## 启动

```bash
pnpm --filter @ai-lab/02-rag-evaluation test
pnpm --filter @ai-lab/02-rag-evaluation start
pnpm --filter @ai-lab/02-rag-evaluation start -- --blog   # 真实语料 + 30 条 golden
```

## 输入 / 输出

语料里有一篇真正讲 LCEL 的文档，另有一篇反复出现 `pipe` 的噪声文档。按标题切时，LCEL 还进得了 Top-2；切成 12 字碎片后，噪声块会占满 Top-2。

```json
{
  "chunker": "heading",
  "k": 2,
  "recallAtK": 1,
  "precisionAtK": 0.25,
  "mrr": 0.25,
  "citationHitRate": 1,
  "abstainAccuracy": 1
}
```

切太碎时 Recall@2 掉到 0.5，Precision 和 MRR 直接归零——后两者对「噪声块挤占前排」更敏感。

问「NVIDIA 今日股价」时语料没有证据，必须拒答且 citations 为空。

## 博客知识库基线（--blog）

语料为 docs/ 全部文章（75 篇）加三篇边界 fixture（恶意注入、旧版草稿、受限文档），golden 30 条覆盖 29 要求的七类：直接事实 12、多跳 5、歧义 3、无答案 5、权限 2、旧文档 1、恶意文档 2。

词项检索 + 按标题分块 + K=5 的基线（测试里设了防退化阈值）：

```json
{
  "plan": "blog-lexical",
  "recallAtK": 0.53,
  "precisionAtK": 0.13,
  "mrr": 0.29,
  "citationHitRate": 0.67,
  "abstainAccuracy": 0.73
}
```

## 模型配置

| 变量 | 说明 |
|------|------|
| `OPENAI_API_KEY` | 有值才打 embedding API |
| `OPENAI_EMBEDDING_MODEL` | 默认 `text-embedding-3-small` |
| `OPENAI_BASE_URL` | 默认 `https://api.openai.com/v1` |

## 已知限制

- 这是评测实验，不是生产向量库。
- 词项检索会放大「重复词刷分」，这是刻意用来暴露分块问题，不代表线上应只用 BM25。
- 混合检索用 RRF 融合词项与向量排名，不依赖任何一路的原始分数刻度；Rerank 需要模型，未在本实验内。
- 演示分词按连续中文切段 + 双向子串匹配，在 70+ 篇真实语料上召回有限（基线 Recall@5 只有 0.53）——这正是换 embedding 的动机。
- extractive answerer 用词覆盖率判拒答：语料「提到过 Vue」但答不了「Vue 3.6 新特性」时会误答，单 token 长问句（如薪资问题）可能把泛词命中当证据。生产应换 LLM 做拒答判断。
- 权限过滤在检索层强制（`visibility` + `visibleTo`），answerer 层不做二次校验。

## Token / 延迟 / 成本

本地演示：0 Token。
