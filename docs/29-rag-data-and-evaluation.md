---
title: RAG 数据管道与评测：从能检索到可信回答
date: 2026-08-29
isComment: true
categories:
- AI
- RAG
tags:
- RAG
- Retrieval
- Evaluation
---

# RAG 数据管道与评测：从能检索到可信回答

> RAG 的瓶颈通常不在最后一次 LLM 调用，而在数据进入索引的过程、召回结果的质量，以及答案是否能被证据支持。
>
> **边界：** 本篇管索引质量和 Recall。检索策略见 [11](./11-advanced-rag-patterns.md)，Agent 端到端回归见 [22](./22-agent-eval-regression.md)。
>
> **配套实验：** [02 RAG 评测](./examples.md#02-rag-评测) — 改分块后看 Recall@K；检索可换成注入的 embedding，证据不足必须拒答。

## 数据管道

```text
采集 → 解析 → 清洗 → 结构化 → 分块 → Embedding → 索引 → 增量更新
```

每个 chunk 都应保留 `source`、标题层级、更新时间、权限范围和稳定 ID。没有这些元数据，后续的引用、删除、过滤和增量更新都会变得脆弱。

## 分块原则

- 先按文档结构切，再按长度切。
- 标题、代码块、表格和列表不要被无意义拆散。
- 父子索引可以用小块召回、父块补充上下文。
- `chunkSize` 和 `overlap` 不是固定答案，应通过 Eval 调参。
- 记录 chunk 的原始位置，方便引用跳转和问题定位。

## 召回指标

| 指标 | 关注点 |
|------|--------|
| Recall@K | 正确证据是否出现在前 K 个结果中 |
| Precision@K | 前 K 个结果中有多少真正相关 |
| MRR | 第一个正确结果出现得有多靠前 |
| NDCG | 多个结果的相关性排序是否合理 |
| Faithfulness | 答案是否被检索证据支持 |
| Answer relevance | 答案是否真正回答了问题 |

不要只测最终答案。应分别测“召回对不对”和“生成答得对不对”，否则无法定位问题。

## Golden 数据集

每条样本至少包含：

```ts
type RagCase = {
  question: string;
  relevantSources: string[];
  expectedPoints: string[];
  shouldAbstain?: boolean;
};
```

样本应覆盖：直接事实、多跳问题、歧义问题、无答案问题、权限过滤、旧文档和恶意文档。

## 引用与拒答

生产 RAG 不应只返回一段自然语言。推荐返回：

```ts
type Answer = {
  text: string;
  citations: Array<{ source: string; chunkId: string; quote?: string }>;
  confidence?: "high" | "medium" | "low";
};
```

当证据不足时，系统应明确拒答或请求澄清，而不是用模型常识填空。引用必须来自实际检索结果，不能让模型自行编造 URL 或标题。

## 增量更新与权限

- 用稳定文档 ID 和内容 hash 判断是否需要重建。
- 删除文档时同时删除所有关联 chunk。
- 查询时执行租户、用户和文档权限过滤。
- 更新索引与发布流程解耦，避免文档已上线但索引仍是旧版本。
- 记录 embedding 模型和索引版本，便于回滚。

## 实践任务

1. 为博客知识库建立 30 条 golden 数据。
2. 分别统计 Recall@5、引用命中率、拒答准确率和答案相关性。
3. 比较纯向量、混合检索、混合检索加 Rerank 三种方案。
4. 修改分块策略后，在 CI 中阻止关键指标明显下降。

## 与已有内容的关系

- RAG 策略见 [11](./11-advanced-rag-patterns.md)。
- 实际博客索引见 [RAG 实战](./rag-blog-knowledge-search.md)。
- LangChain 检索 API 见 [LC12](./langchain/12-retrievers.md)。
- Agent Eval 见 [22](./22-agent-eval-regression.md)。
