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
import { evaluateRag } from "./evaluate.js";
import { retrieveEmbedded, type EmbedText } from "./retrieve.js";
import type { RagEvalResult } from "./types.js";

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
const retrieve = apiKey
  ? (chunks: Parameters<typeof retrieveEmbedded>[0], query: string, k: number) =>
      retrieveEmbedded(chunks, query, k, createOpenAiEmbed(apiKey))
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
  apiKey
    ? "使用 OpenAI embedding。同一组 golden：按标题切 vs 切太碎。"
    : "未设置 OPENAI_API_KEY，使用词项检索。同一组 golden：按标题切 vs 切太碎。",
);
printResult("heading", heading);
printResult(`fixed-${TINY_CHUNK_SIZE}`, tiny);
