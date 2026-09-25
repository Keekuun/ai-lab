import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chunkByFixedSize, chunkByHeading } from "./chunk.js";

function loadDotEnv(fileName: string): void {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) {
    return;
  }
  for (const rawLine of readFileSync(filePath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv(".env");
import { corpus, goldenCases } from "./corpus.js";
import { loadDocsCorpus } from "./docs-corpus.js";
import { evaluateRag, type RetrieveChunks } from "./evaluate.js";
import { blogFixtures, blogGoldenCases } from "./golden-blog.js";
import { retrieveEmbedded, retrieveHybrid, retrieveLexical, type EmbedText } from "./retrieve.js";
import type { Chunk, RagEvalResult } from "./types.js";

const DEFAULT_TOP_K = 2;
const TINY_CHUNK_SIZE = 12;

function printResult(label: string, result: RagEvalResult): void {
  console.log(
    JSON.stringify(
      {
        chunker: label,
        k: DEFAULT_TOP_K,
        ...result,
      },
      null,
      2,
    ),
  );
}

function createOpenAiEmbed(apiKey: string): EmbedText {
  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const model = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

  return async (text) => {
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model, input: text }),
    });
    if (!response.ok) {
      throw new Error(`Embedding 请求失败：${response.status} ${await response.text()}`);
    }
    const payload = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
    const vector = payload.data?.[0]?.embedding;
    if (!vector) {
      throw new Error("Embedding 返回空向量");
    }
    return vector;
  };
}

const apiKey = process.env.OPENAI_API_KEY;
const embed = apiKey ? createOpenAiEmbed(apiKey) : undefined;
const retrieve = embed
  ? (chunks: Parameters<typeof retrieveEmbedded>[0], query: string, k: number) =>
      retrieveEmbedded(chunks, query, k, embed)
  : undefined;

const heading = await evaluateRag({
  documents: corpus,
  cases: goldenCases,
  chunker: chunkByHeading,
  k: DEFAULT_TOP_K,
  retrieve,
});

const tiny = await evaluateRag({
  documents: corpus,
  cases: goldenCases,
  chunker: (documents) => chunkByFixedSize(documents, TINY_CHUNK_SIZE),
  k: DEFAULT_TOP_K,
  retrieve,
});

console.error(
  embed
    ? "使用 OpenAI embedding。同一组 golden：按标题切 vs 切太碎。"
    : "未设置 OPENAI_API_KEY，使用词项检索。同一组 golden：按标题切 vs 切太碎。",
);
printResult("heading", heading);
printResult(`fixed-${TINY_CHUNK_SIZE}`, tiny);

if (embed) {
  // 29 实践任务：同一分块下比较 词项 / 纯向量 / 混合（RRF）三种检索
  const plans: Array<{ label: string; retrieve: RetrieveChunks }> = [
    { label: "lexical", retrieve: retrieveLexical },
    { label: "vector", retrieve: (chunks, query, k) => retrieveEmbedded(chunks, query, k, embed) },
    { label: "hybrid-rrf", retrieve: (chunks, query, k) => retrieveHybrid(chunks, query, k, embed) },
  ];
  console.error("按标题分块，三种检索方案对比：");
  for (const plan of plans) {
    const result = await evaluateRag({
      documents: corpus,
      cases: goldenCases,
      chunker: chunkByHeading,
      k: DEFAULT_TOP_K,
      retrieve: plan.retrieve,
    });
    printResult(plan.label, result);
  }
}

// --blog：在真实博客语料（docs/ + 边界 fixtures）上跑 30 条 golden
if (process.argv.includes("--blog")) {
  const blogDocuments = [
    ...loadDocsCorpus(resolve(import.meta.dirname, "../../../docs")),
    ...blogFixtures,
  ];
  const blogK = 5;
  const blogPlans: Array<{ label: string; retrieve?: RetrieveChunks }> = [
    { label: "blog-lexical" },
    ...(embed
      ? [
          {
            label: "blog-hybrid-rrf",
            retrieve: ((chunks, query, k, visibleTo) =>
              retrieveHybrid(chunks, query, k, embed, visibleTo)) as RetrieveChunks,
          },
        ]
      : []),
  ];
  console.error(`博客知识库：${blogDocuments.length} 篇文档，${blogGoldenCases.length} 条 golden，K=${blogK}`);
  for (const plan of blogPlans) {
    const result = await evaluateRag({
      documents: blogDocuments,
      cases: blogGoldenCases,
      chunker: chunkByHeading,
      k: blogK,
      retrieve: plan.retrieve,
    });
    console.log(
      JSON.stringify({ chunker: "heading", plan: plan.label, k: blogK, ...result }, null, 2),
    );
  }
}

// --ollama：接本地 Ollama 跑真实 LLM 全链路——检索（词项/混合）+ 生成（gemma4）+ LLM 评判。
// 用法：tsx src/cli.ts --ollama [--limit N]；需先 ollama serve 并拉取 gemma4 与 bge-m3。
if (process.argv.includes("--ollama")) {
  const { answerWithLlm, ANSWER_JSON_SCHEMA } = await import("./llm-answer.js");
  const { judgeAnswerRelevance, JUDGE_JSON_SCHEMA } = await import("./llm-judge.js");
  const { createOllamaClient } = await import("./ollama.js");
  const { withEmbeddingCache } = await import("./retrieve.js");

  const client = createOllamaClient({});
  if (!(await client.isReachable())) {
    console.error(`连不上 Ollama（${client.host}）。先运行：brew services start ollama`);
    process.exit(1);
  }

  // --limit N：取前 N 条 golden 做快速冒烟
  const limitIndex = process.argv.indexOf("--limit");
  const limit = limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : undefined;
  const ollamaCases =
    limit !== undefined && Number.isInteger(limit) && limit > 0
      ? blogGoldenCases.slice(0, limit)
      : blogGoldenCases;

  const generateJson = (prompt: string) =>
    client.generate(prompt, { schema: ANSWER_JSON_SCHEMA, think: false });
  const answer = (question: string, chunks: Chunk[]) => answerWithLlm(question, chunks, generateJson);
  const judge = (question: string, answerText: string, points: string[]) =>
    judgeAnswerRelevance(question, answerText, points, (prompt) =>
      client.generate(prompt, { schema: JUDGE_JSON_SCHEMA, think: false }),
    );

  const blogDocuments = [
    ...loadDocsCorpus(resolve(import.meta.dirname, "../../../docs")),
    ...blogFixtures,
  ];
  const blogK = 5;

  // 向量模型可用才跑混合检索；先切块并预热向量缓存（限流 8 路），
  // 否则 retrieveEmbedded 会对几百个 chunk 同时打满 Ollama。
  const tags = (await (await fetch(`${client.host}/api/tags`)).json()) as {
    models?: Array<{ name: string }>;
  };
  const hasEmbedModel = Boolean(tags.models?.some((m) => m.name.startsWith(client.embedModel)));
  const cachedEmbed = withEmbeddingCache((text) => client.embed(text));
  const plans: Array<{ label: string; retrieve: RetrieveChunks }> = [
    { label: "ollama-lexical", retrieve: retrieveLexical },
  ];
  let preChunked: Chunk[] | undefined;
  if (hasEmbedModel) {
    preChunked = chunkByHeading(blogDocuments);
    const CONCURRENCY = 8;
    for (let start = 0; start < preChunked.length; start += CONCURRENCY) {
      await Promise.all(preChunked.slice(start, start + CONCURRENCY).map((chunk) => cachedEmbed(chunk.text)));
      if ((start / CONCURRENCY) % 10 === 0) {
        console.error(`[ollama] 向量预热 ${Math.min(start + CONCURRENCY, preChunked.length)}/${preChunked.length}`);
      }
    }
    plans.push({
      label: "ollama-hybrid-rrf",
      retrieve: ((chunks, query, k, visibleTo) =>
        retrieveHybrid(chunks, query, k, cachedEmbed, visibleTo)) as RetrieveChunks,
    });
  } else {
    console.error(`未找到向量模型 ${client.embedModel}，只跑词项检索。ollama pull ${client.embedModel} 后可跑混合检索。`);
  }

  console.error(
    `[ollama] 模型 ${client.model}，向量 ${hasEmbedModel ? client.embedModel : "无"}，` +
      `${blogDocuments.length} 篇文档，${ollamaCases.length} 条 golden，K=${blogK}`,
  );
  for (const plan of plans) {
    const startedAt = Date.now();
    const result = await evaluateRag({
      documents: blogDocuments,
      cases: ollamaCases,
      chunker: preChunked ? () => preChunked : chunkByHeading,
      k: blogK,
      retrieve: plan.retrieve,
      answer,
      judge,
      onCase: (index, total, caseId) =>
        console.error(`[ollama] ${plan.label} ${index}/${total} ${caseId}`),
    });
    console.log(
      JSON.stringify(
        {
          plan: plan.label,
          model: client.model,
          k: blogK,
          seconds: Math.round((Date.now() - startedAt) / 1000),
          ...result,
        },
        null,
        2,
      ),
    );
  }
}
