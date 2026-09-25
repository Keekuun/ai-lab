export type Document = {
  source: string;
  text: string;
  visibility?: string[];
};

export type Chunk = {
  chunkId: string;
  source: string;
  text: string;
  visibility?: string[];
};

export type RagCase = {
  id: string;
  question: string;
  relevantSources: string[];
  expectedPoints: string[];
  shouldAbstain?: boolean;
  asRole?: string;
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
  precisionAtK: number;
  mrr: number;
  citationHitRate: number;
  abstainAccuracy: number;
  // 提供 judge 时才存在：LLM 评判的答案要点覆盖率（0..1），拒答样本不计入
  llmRelevance?: number;
};
