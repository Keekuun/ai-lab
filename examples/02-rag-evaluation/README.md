# 02 RAG Evaluation

对应 [29 RAG 数据管道与评测](../../docs/29-rag-data-and-evaluation.md)、[11 RAG 进阶](../../docs/11-advanced-rag-patterns.md)。

验收：改分块策略后，Recall@K、Precision@K、MRR 和引用命中率有数字；证据不足必须拒答，引用只能来自本次检索。

## 前置条件

- Node.js 22+
- 在仓库根目录执行过 `pnpm install`

默认不需要 API Key。测试用注入的假向量；CLI 不填 Key 走词项检索，填了 `OPENAI_API_KEY` 才打 `/embeddings`，并额外输出 词项 / 纯向量 / 混合（RRF）三种检索方案的对比。

有本地 [Ollama](https://ollama.com) 时可以跑真实 LLM 全链路（生成用 `gemma4`，向量用 `bge-m3`）：

```bash
brew services start ollama        # 或 ollama serve
ollama pull gemma4                # 生成模型
ollama pull bge-m3                # 中文向量模型（没有则只跑词项检索）
```

## 启动

```bash
pnpm --filter @ai-lab/02-rag-evaluation test
pnpm --filter @ai-lab/02-rag-evaluation start
pnpm --filter @ai-lab/02-rag-evaluation start -- --blog   # 真实语料 + 30 条 golden
pnpm --filter @ai-lab/02-rag-evaluation start -- --ollama # 本地 Ollama：真实生成 + LLM 评判
pnpm --filter @ai-lab/02-rag-evaluation start -- --ollama --limit 3  # 先跑 3 条冒烟
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

## 真实 LLM 全链路（--ollama）

同一套 30 条 golden，检索/生成/评判全部换成真实模型（gemma4 生成 + bge-m3 向量，M4 本地跑，单方案约 7 分钟）：

| 指标 | 启发式基线 | ollama-lexical | ollama-hybrid-rrf |
|------|-----------|----------------|-------------------|
| Recall@5 | 0.83 | 0.83 | **0.97** |
| Precision@5 | 0.23 | 0.23 | 0.39 |
| MRR | 0.51 | 0.51 | **0.66** |
| 引用命中率 | 0.67 | **0.80** | 0.77 |
| 拒答准确率 | 0.93 | 0.87 | **0.93** |
| LLM 相关性 | — | 0.95 | **1.0** |

三个真实结论：

1. **中文向量检索明显赢过 bigram BM25**：bge-m3 混合检索把 Recall@5 从 0.83 推到 0.97、MRR 从 0.51 到 0.66——词项检索调参的天花板，语义检索轻松越过。
2. **小模型裸输出不可靠，工程纪律三连才可用**：最初 `format:"json"` 下 24 条该答样本误拒 14 条（拒答准确率 0.53）。逐项修复：`think:false` 关思考模式（思考会在 JSON 里塞冗长 thought 字段导致截断）→ 不合规输出重试一次 → **schema 约束解码**（Ollama `format` 传 JSON Schema，根治「模型把答案组织成自由 JSON」）。最终误拒 14 → 4，剩下的基本是检索漏召回的合理拒答，拒答准确率回到 0.93，耗时还降了 7 倍（1476s → 431s）。
3. **答得好和管得住嘴是两回事**：llmRelevance 0.95~1.0 说明该答的题目质量很高；但拒答纪律全靠输出工程兜底，不是模型自觉——这正是 30 护栏里「输出校验」存在的理由。

集成测试（`test/ollama-integration.test.ts`）在本地有 Ollama 时跑真实模型，CI 上自动跳过，不影响流水线。

## 模型配置

| 变量 | 说明 |
|------|------|
| `OPENAI_API_KEY` | 有值才打 embedding API |
| `OPENAI_EMBEDDING_MODEL` | 默认 `text-embedding-3-small` |
| `OPENAI_BASE_URL` | 默认 `https://api.openai.com/v1` |
| `OLLAMA_HOST` | 默认 `http://localhost:11434` |
| `OLLAMA_MODEL` | 生成模型，默认 `gemma4:latest` |
| `OLLAMA_EMBED_MODEL` | 向量模型，默认 `bge-m3` |

## 已知限制

- 这是评测实验，不是生产向量库。
- 词项检索用词频饱和前的原始计数会放大「重复词刷分」（toy corpus 里 noise 赢过 LCEL），这是刻意保留的教学点；真实语料上已加 BM25 饱和。
- 混合检索用 RRF 融合词项与向量排名，不依赖任何一路的原始分数刻度；Rerank 需要交叉编码器，bge-m3 是双编码器，未在本实验内。
- 「如何在 Kubernetes 上部署」这类泛词多的问句仍可能误答（拒答率 0.93 不是 1.0）。实测换真实 LLM 判断反而更松（见上表），生产应叠加规则校验而非全靠模型自觉。
- 权限过滤在检索层强制（`visibility` + `visibleTo`），answerer 层不做二次校验。

## Token / 延迟 / 成本

本地演示：0 Token。
