import assert from "node:assert/strict";
import { answerFromChunks } from "./answer.js";
import { citationHit, mrr, precisionAtK, recallAtK } from "./metrics.js";
import { retrieveLexical } from "./retrieve.js";
import type { Document, RagCase, RagEvalResult, Chunk } from "./types.js";

export type RetrieveChunks = (
  chunks: Chunk[],
  query: string,
  k: number,
  visibleTo?: string,
) => Chunk[] | Promise<Chunk[]>;

export async function evaluateRag(options: {
  documents: Document[];
  cases: RagCase[];
  chunker: (documents: Document[]) => Chunk[];
  k: number;
  retrieve?: RetrieveChunks;
}): Promise<RagEvalResult> {
  assert(options.cases.length > 0, "golden cases 不能为空");
  assert(options.k >= 1, "k 必须 >= 1");

  const chunks = options.chunker(options.documents);
  const retrieve = options.retrieve ?? retrieveLexical;
  let recallSum = 0;
  let precisionSum = 0;
  let mrrSum = 0;
  let citationSum = 0;
  let abstainCorrect = 0;

  for (const ragCase of options.cases) {
    const retrieved = await retrieve(chunks, ragCase.question, options.k, ragCase.asRole);
    const answer = answerFromChunks(ragCase.question, retrieved);
    recallSum += recallAtK(retrieved, ragCase.relevantSources, options.k);
    precisionSum += precisionAtK(retrieved, ragCase.relevantSources, options.k);
    mrrSum += mrr(retrieved, ragCase.relevantSources);
    citationSum += citationHit(answer, retrieved, ragCase.relevantSources) ? 1 : 0;
    if (answer.abstained === Boolean(ragCase.shouldAbstain)) {
      abstainCorrect += 1;
    }
  }

  const total = options.cases.length;
  return {
    recallAtK: recallSum / total,
    precisionAtK: precisionSum / total,
    mrr: mrrSum / total,
    citationHitRate: citationSum / total,
    abstainAccuracy: abstainCorrect / total,
  };
}
