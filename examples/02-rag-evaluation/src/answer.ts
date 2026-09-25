import type { Chunk, RagAnswer } from "./types.js";
import { tokenizeBigram } from "./retrieve.js";

const STOP_WORDS = new Set(["是", "什么", "是什么", "今日", "的", "了", "吗", "呢"]);

// 证据门槛：chunk 覆盖问题 bigram 的比例下限。bigram 分词后问句与文档用词不必完全重叠，
// 覆盖率天然偏低；按真实语料分布校准：该答样本最低 0.36，该拒样本最高 0.43，
// 取 0.35 让该答的全过，漏网的 k8s/rust 类泛词误答是词项检索的天花板（见 README）。
const MIN_TOKEN_COVERAGE = 0.35;

function contentTokens(text: string): string[] {
  return tokenizeBigram(text).filter((token) => !STOP_WORDS.has(token) && token.length > 1);
}

function coverage(chunkTokens: string[], questionTokens: string[]): number {
  if (questionTokens.length === 0) {
    return 0;
  }
  const chunkTokenSet = new Set(chunkTokens);
  const covered = questionTokens.filter((token) => chunkTokenSet.has(token)).length;
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
