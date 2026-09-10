export type Document = {
  source: string;
  text: string;
};

export type Chunk = {
  chunkId: string;
  source: string;
  text: string;
};

export type RagCase = {
  id: string;
  question: string;
  relevantSources: string[];
  expectedPoints: string[];
  shouldAbstain?: boolean;
};

export type Citation = {
  source: string;
  chunkId: string;
  quote?: string;
};

export type RagAnswer = {
  text: string;
  citations: Citation[];
  abstained: boolean;
};

export type RagEvalResult = {
  recallAtK: number;
  citationHitRate: number;
  abstainAccuracy: number;
};
