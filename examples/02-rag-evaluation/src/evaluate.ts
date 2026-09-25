import assert from "node:assert/strict";
import { answerFromChunks } from "./answer.js";
import { citationHit, mrr, precisionAtK, recallAtK } from "./metrics.js";
import { retrieveLexical } from "./retrieve.js";
import type { Document, RagAnswer, RagCase, RagEvalResult, Chunk } from "./types.js";

export type RetrieveChunks = (
  chunks: Chunk[],
  query: string,
  k: number,
  visibleTo?: string,
) => Chunk[] | Promise<Chunk[]>;

// answer 可注入：默认词覆盖启发式（answer.ts），接真实 LLM 时传 answerWithLlm。
// judge 可注入：提供时对每个「该答且未拒答」的样本做 LLM 要点覆盖评判。
export type AnswerQuestion = (question: string, retrieved: Chunk[]) => RagAnswer | Promise<RagAnswer>;
export type JudgeRelevance = (
  question: string,
  answerText: string,
  expectedPoints: string[],
) => Promise<number>;

export async function evaluateRag(options: {
  documents: Document[];
  cases: RagCase[];
  chunker: (documents: Document[]) => Chunk[];
  k: number;
  retrieve?: RetrieveChunks;
  answer?: AnswerQuestion;
  judge?: JudgeRelevance;
  onCase?: (index: number, total: number, caseId: string) => void;
}): Promise<RagEvalResult> {
  assert(options.cases.length > 0, "golden cases 不能为空");
  assert(options.k >= 1, "k 必须 >= 1");

  const chunks = options.chunker(options.documents);
  const retrieve = options.retrieve ?? retrieveLexical;
  const answer = options.answer ?? answerFromChunks;
  let recallSum = 0;
  let precisionSum = 0;
  let mrrSum = 0;
  let citationSum = 0;
  let abstainCorrect = 0;
  let relevanceSum = 0;
  let relevanceCount = 0;

  for (const [caseIndex, ragCase] of options.cases.entries()) {
    options.onCase?.(caseIndex + 1, options.cases.length, ragCase.id);
    const retrieved = await retrieve(chunks, ragCase.question, options.k, ragCase.asRole);
    const ragAnswer = await answer(ragCase.question, retrieved);
    recallSum += recallAtK(retrieved, ragCase.relevantSources, options.k);
    precisionSum += precisionAtK(retrieved, ragCase.relevantSources, options.k);
    mrrSum += mrr(retrieved, ragCase.relevantSources);
    citationSum += citationHit(ragAnswer, retrieved, ragCase.relevantSources) ? 1 : 0;
    if (ragAnswer.abstained === Boolean(ragCase.shouldAbstain)) {
      abstainCorrect += 1;
    }
    // 拒答样本没有答案可评判；该答且作答的才让 LLM 打分
    if (options.judge && !ragAnswer.abstained) {
      relevanceSum += await options.judge(ragCase.question, ragAnswer.text, ragCase.expectedPoints);
      relevanceCount += 1;
    }
  }

  const total = options.cases.length;
  return {
    recallAtK: recallSum / total,
    precisionAtK: precisionSum / total,
    mrr: mrrSum / total,
    citationHitRate: citationSum / total,
    abstainAccuracy: abstainCorrect / total,
    ...(options.judge ? { llmRelevance: relevanceCount > 0 ? relevanceSum / relevanceCount : 0 } : {}),
  };
}
