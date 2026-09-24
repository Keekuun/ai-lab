import assert from "node:assert/strict";
import type { Chunk } from "./types.js";

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]+/g) ?? [];
}

// 演示级分词按连续中文切段，用双向子串匹配近似子词命中：
// 「薪资」命中「薪资计算」，长问句「内部薪资级别系数怎么算」命中「内部薪资」
export function tokenMatches(chunkToken: string, queryToken: string): boolean {
  const shorter = chunkToken.length <= queryToken.length ? chunkToken : queryToken;
  if (shorter.length < 2) {
    return chunkToken === queryToken;
  }
  return chunkToken.includes(queryToken) || queryToken.includes(chunkToken);
}

function scoreChunk(chunk: Chunk, queryTokens: string[]): number {
  const chunkTokens = tokenize(chunk.text);
  return queryTokens.reduce((score, token) => {
    return score + chunkTokens.filter((chunkToken) => tokenMatches(chunkToken, token)).length;
  }, 0);
}

export type EmbedText = (text: string) => Promise<number[]>;

// 29：查询时执行权限过滤。visibility 为空表示所有人可见；否则任一角色匹配即可见
function isVisible(chunk: Chunk, visibleTo?: string): boolean {
  if (!chunk.visibility || chunk.visibility.length === 0) {
    return true;
  }
  return visibleTo !== undefined && chunk.visibility.includes(visibleTo);
}

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
  visibleTo?: string,
): Promise<Chunk[]> {
  assert(k >= 1, "k 必须 >= 1");
  assert(query.trim().length > 0, "query 不能为空");

  const queryVector = await embed(query);
  const visibleChunks = chunks.filter((chunk) => isVisible(chunk, visibleTo));
  const scored = await Promise.all(
    visibleChunks.map(async (chunk) => ({
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

export function retrieveLexical(
  chunks: Chunk[],
  query: string,
  k: number,
  visibleTo?: string,
): Chunk[] {
  assert(k >= 1, "k 必须 >= 1");
  assert(query.trim().length > 0, "query 不能为空");

  const queryTokens = tokenize(query);
  return [...chunks]
    .filter((chunk) => isVisible(chunk, visibleTo))
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

const DEFAULT_RRF_K = 60;

function rankMap(ranked: Chunk[]): Map<string, number> {
  const ranks = new Map<string, number>();
  ranked.forEach((chunk, index) => {
    ranks.set(chunk.chunkId, index + 1);
  });
  return ranks;
}

export async function retrieveHybrid(
  chunks: Chunk[],
  query: string,
  k: number,
  embed: EmbedText,
  visibleTo?: string,
  rrfK: number = DEFAULT_RRF_K,
): Promise<Chunk[]> {
  assert(k >= 1, "k 必须 >= 1");
  assert(rrfK >= 1, "rrfK 必须 >= 1");

  const visibleChunks = chunks.filter((chunk) => isVisible(chunk, visibleTo));
  // 两路都取完整排名，单路漏掉的 chunk 在另一路仍能贡献分数；visibleTo 透传保持一致过滤
  const lexicalRanks = rankMap(
    retrieveLexical(visibleChunks, query, visibleChunks.length, visibleTo),
  );
  const vectorRanks = rankMap(
    await retrieveEmbedded(visibleChunks, query, visibleChunks.length, embed, visibleTo),
  );

  const fused = visibleChunks.map((chunk) => {
    const lexicalRank = lexicalRanks.get(chunk.chunkId);
    const vectorRank = vectorRanks.get(chunk.chunkId);
    const score =
      (lexicalRank === undefined ? 0 : 1 / (rrfK + lexicalRank)) +
      (vectorRank === undefined ? 0 : 1 / (rrfK + vectorRank));
    return { chunk, score };
  });

  return fused
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
