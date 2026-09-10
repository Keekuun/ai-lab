import assert from "node:assert/strict";
import type { Chunk } from "./types.js";

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]+/g) ?? [];
}

function scoreChunk(chunk: Chunk, queryTokens: string[]): number {
  const chunkTokens = tokenize(chunk.text);
  return queryTokens.reduce((score, token) => {
    return score + chunkTokens.filter((chunkToken) => chunkToken === token).length;
  }, 0);
}

export type EmbedText = (text: string) => Promise<number[]>;

export function cosineSimilarity(left: number[], right: number[]): number {
  assert(left.length === right.length && left.length > 0, "向量维度必须一致且非空");
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }
  const denominator = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  assert(denominator > 0, "向量不能为零向量");
  return dot / denominator;
}

export async function retrieveEmbedded(
  chunks: Chunk[],
  query: string,
  k: number,
  embed: EmbedText,
): Promise<Chunk[]> {
  assert(k >= 1, "k 必须 >= 1");
  assert(query.trim().length > 0, "query 不能为空");

  const queryVector = await embed(query);
  const scored = await Promise.all(
    chunks.map(async (chunk) => ({
      chunk,
      score: cosineSimilarity(queryVector, await embed(chunk.text)),
    })),
  );

  return scored
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.chunk.chunkId.localeCompare(right.chunk.chunkId);
    })
    .slice(0, k)
    .map((entry) => entry.chunk);
}

export function retrieveLexical(chunks: Chunk[], query: string, k: number): Chunk[] {
  assert(k >= 1, "k 必须 >= 1");
  assert(query.trim().length > 0, "query 不能为空");

  const queryTokens = tokenize(query);
  return [...chunks]
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, queryTokens) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.chunk.chunkId.localeCompare(right.chunk.chunkId);
    })
    .slice(0, k)
    .map((entry) => entry.chunk);
}
