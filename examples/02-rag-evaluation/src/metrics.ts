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

export function precisionAtK(
  retrieved: Chunk[],
  relevantSources: string[],
  k: number,
): number {
  assert(k >= 1, "k 必须 >= 1");
  const top = retrieved.slice(0, k);
  if (top.length === 0) {
    return 0;
  }

  const relevant = new Set(relevantSources);
  const hits = top.filter((chunk) => relevant.has(chunk.source)).length;
  return hits / top.length;
}

export function mrr(retrieved: Chunk[], relevantSources: string[]): number {
  const relevant = new Set(relevantSources);
  const rank = retrieved.findIndex((chunk) => relevant.has(chunk.source));
  return rank === -1 ? 0 : 1 / (rank + 1);
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
