import assert from "node:assert/strict";
import type { Chunk, RagAnswer } from "./types.js";

export function recallAtK(
  retrieved: Chunk[],
  relevantSources: string[],
  k: number,
): number {
  assert(k >= 1, "k 必须 >= 1");
  if (relevantSources.length === 0) {
    return 1;
  }

  const topSources = new Set(retrieved.slice(0, k).map((chunk) => chunk.source));
  return relevantSources.some((source) => topSources.has(source)) ? 1 : 0;
}

export function citationHit(
  answer: RagAnswer,
  retrieved: Chunk[],
  relevantSources: string[],
): boolean {
  const retrievedIds = new Set(retrieved.map((chunk) => chunk.chunkId));
  const citationsFromRetrieval = answer.citations.every(
    (citation) =>
      retrievedIds.has(citation.chunkId) &&
      retrieved.some(
        (chunk) => chunk.chunkId === citation.chunkId && chunk.source === citation.source,
      ),
  );

  if (!citationsFromRetrieval) {
    return false;
  }

  if (answer.abstained) {
    return answer.citations.length === 0;
  }

  return answer.citations.some((citation) => relevantSources.includes(citation.source));
}
