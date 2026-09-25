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

词项检索（bigram + 完整 BM25：TF 饱和 + IDF）+ 按标题分块 + K=5 的基线（测试里设了防退化阈值）：

```json
{
  "plan": "blog-lexical",
  "recallAtK": 0.83,
  "precisionAtK": 0.23,
  "mrr": 0.51,
  "citationHitRate": 0.67,
  "abstainAccuracy": 0.93
}
```

分词演进：连续中文整段成 token（Recall@5 = 0.53，「薪资」打不中「薪资计算」）→ bigram 二字滑动窗口（0.83）→ BM25 词频饱和 `tf/(tf+k1)` 防长文霸榜（拒答率 0.73 → 0.93）→ IDF 让罕见词压过泛词（MRR 0.43 → 0.51）。改检索器看指标动，正是 29 的调参方法。

## 模型配置

| 变量 | 说明 |
|------|------|
| `OPENAI_API_KEY` | 有值才打 embedding API |
| `OPENAI_EMBEDDING_MODEL` | 默认 `text-embedding-3-small` |
| `OPENAI_BASE_URL` | 默认 `https://api.openai.com/v1` |

## 已知限制

- 这是评测实验，不是生产向量库。
- 词项检索用词频饱和前的原始计数会放大「重复词刷分」（toy corpus 里 noise 赢过 LCEL），这是刻意保留的教学点；真实语料上已加 BM25 饱和。
- 混合检索用 RRF 融合词项与向量排名，不依赖任何一路的原始分数刻度；Rerank 需要模型，未在本实验内。
- 演示分词是 bigram 二字窗口，无 IDF 和词性权重；「如何在 Kubernetes 上部署」这类泛词多的问句仍可能误答（拒答率 0.93 不是 1.0）。生产应换 embedding + LLM 拒答判断。
- 权限过滤在检索层强制（`visibility` + `visibleTo`），answerer 层不做二次校验。

## Token / 延迟 / 成本

本地演示：0 Token。
