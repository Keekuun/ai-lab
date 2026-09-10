import type { Chunk, RagAnswer } from "./types.js";
import { tokenize } from "./retrieve.js";

const STOP_WORDS = new Set(["是", "什么", "是什么", "今日", "的", "了", "吗", "呢"]);

function contentTokens(text: string): string[] {
  return tokenize(text).filter((token) => !STOP_WORDS.has(token) && token.length > 1);
}

export function answerFromChunks(question: string, retrieved: Chunk[]): RagAnswer {
  const questionTokens = contentTokens(question);
  const evidence = retrieved.filter((chunk) => {
    const chunkTokens = new Set(contentTokens(chunk.text));
    return questionTokens.some((token) => chunkTokens.has(token));
  });

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
