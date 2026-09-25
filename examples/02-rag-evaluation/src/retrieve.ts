import assert from "node:assert/strict";
import type { Chunk } from "./types.js";

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]+/g) ?? [];
}

// 中文按二字滑动窗口切 bigram，英文/数字保持整词。
// 解决「薪资计算」整段成 token、打不中「薪资」的问题；bigram 后用精确匹配即可。
export function tokenizeBigram(text: string): string[] {
  const segments = tokenize(text);
  const tokens: string[] = [];
  for (const segment of segments) {
    if (/^[a-z0-9]+$/.test(segment) || segment.length === 1) {
      tokens.push(segment);
    } else {
      for (let index = 0; index < segment.length - 1; index += 1) {
        tokens.push(segment.slice(index, index + 2));
      }
    }
  }
  return tokens;
}

// BM25 式词频饱和：tf/(tf+k1)。词频有贡献但不过度——
// noise 重复 pipe 仍能刷分赢过 LCEL（教学点保留），但真实语料里高频长文不会霸榜。
const BM25_K1 = 1.2;

// BM25 的另一半：IDF 让罕见词权重大、泛词权重小。
// 标准变体 ln((N - df + 0.5) / (df + 0.5) + 1)，保证非负。
export function idfMap(chunks: Chunk[]): Map<string, number> {
  const documentFrequency = new Map<string, number>();
  for (const chunk of chunks) {
    for (const token of new Set(tokenizeBigram(chunk.text))) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }
  const total = chunks.length;
  const idf = new Map<string, number>();
  for (const [token, df] of documentFrequency) {
    idf.set(token, Math.log((total - df + 0.5) / (df + 0.5) + 1));
  }
  return idf;
}

function scoreChunk(chunk: Chunk, queryTokens: string[], idf: Map<string, number>): number {
  const chunkTokens = tokenizeBigram(chunk.text);
  return queryTokens.reduce((score, token) => {
    const tf = chunkTokens.filter((chunkToken) => chunkToken === token).length;
    if (tf === 0) {
      return score;
    }
    return score + (idf.get(token) ?? 0) * (tf / (tf + BM25_K1));
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

  const queryTokens = tokenizeBigram(query);
  const visibleChunks = chunks.filter((chunk) => isVisible(chunk, visibleTo));
  const idf = idfMap(visibleChunks);
  return [...visibleChunks]
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, queryTokens, idf) }))
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
