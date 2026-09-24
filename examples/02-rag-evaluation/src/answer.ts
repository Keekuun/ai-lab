import type { Chunk, RagAnswer } from "./types.js";
import { tokenize, tokenMatches } from "./retrieve.js";

const STOP_WORDS = new Set(["是", "什么", "是什么", "今日", "的", "了", "吗", "呢"]);

// 证据门槛：chunk 至少覆盖 2/3 的问题词才算证据。
// 宁可保守拒答（该答的没答）也不编造（该拒的答了）——后者在安全上严重得多。
// 「如何在 Kubernetes 上部署」只命中「如何」「部署」等泛词时覆盖率低，应当拒答。
const MIN_TOKEN_COVERAGE = 2 / 3;

function contentTokens(text: string): string[] {
  return tokenize(text).filter((token) => !STOP_WORDS.has(token) && token.length > 1);
}

function coverage(chunkTokens: string[], questionTokens: string[]): number {
  if (questionTokens.length === 0) {
    return 0;
  }
  const covered = questionTokens.filter((questionToken) =>
    chunkTokens.some((chunkToken) => tokenMatches(chunkToken, questionToken)),
  ).length;
  return covered / questionTokens.length;
}

export function answerFromChunks(question: string, retrieved: Chunk[]): RagAnswer {
  const questionTokens = contentTokens(question);
  const evidence = retrieved.filter(
    (chunk) => coverage(contentTokens(chunk.text), questionTokens) >= MIN_TOKEN_COVERAGE,
  );

  if (evidence.length === 0) {
    return {
      text: "检索结果不足以回答，拒绝编造。",
      citations: [],
      abstained: true,
    };
  }

  const best = evidence[0];
  return {
    text: best.text,
    citations: evidence.map((chunk) => ({
      source: chunk.source,
      chunkId: chunk.chunkId,
      quote: chunk.text,
    })),
    abstained: false,
  };
}
