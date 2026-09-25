import type { Chunk, RagAnswer } from "./types.js";

// 真实 LLM 答题器：把检索到的 chunk 编号塞进 Prompt，要求只依据证据回答并输出 JSON。
// 与 answer.ts 的词覆盖启发式不同，这里由模型判断证据是否充分；
// 但解析失败一律兜底拒答——宁可不答，不可编造（29 的验收口径）。

export type LlmGenerate = (prompt: string) => Promise<string>;

// 约束解码 schema：配合 Ollama format 参数强制输出结构，
// 否则小模型会把「输出 JSON」理解成「把答案组织成任意 JSON」
export const ANSWER_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    answer: { type: "string" },
    citations: { type: "array", items: { type: "integer" } },
    abstained: { type: "boolean" },
  },
  required: ["answer", "citations", "abstained"],
};

type LlmAnswerPayload = {
  answer?: unknown;
  citations?: unknown;
  abstained?: unknown;
};

// 从模型输出里抠出第一个 JSON 对象：容忍 ```json 围栏和前后废话
export function extractJsonObject(raw: string): Record<string, unknown> | undefined {
  const withoutFence = raw.replace(/```(?:json)?/g, "");
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(withoutFence.slice(start, end + 1));
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function buildPrompt(question: string, chunks: Chunk[]): string {
  const evidence = chunks
    .map((chunk, index) => `[${index + 1}]（来源：${chunk.source}）\n${chunk.text}`)
    .join("\n\n");
  return `你是一个严谨的知识库问答助手。下面给你若干编号的证据片段和一个问题。

要求：
1. 只能依据证据片段回答，禁止使用证据之外的知识；
2. 证据足以回答时，输出 JSON：{"answer": "你的回答", "citations": [用到的证据编号], "abstained": false}；
3. 证据不足或与问题无关时，输出 JSON：{"answer": "", "citations": [], "abstained": true}；
4. 只输出 JSON，不要输出任何其他内容。

证据片段：
${evidence}

问题：${question}`;
}

export async function answerWithLlm(
  question: string,
  retrieved: Chunk[],
  generate: LlmGenerate,
): Promise<RagAnswer> {
  if (retrieved.length === 0) {
    return { text: "没有检索到任何证据，拒绝编造。", citations: [], abstained: true };
  }

  // 真实小模型输出不稳定：空答案、截断 JSON、thought 啰嗦都常见。
  // 不合规就换更严厉的措辞重试一次；两次都不行才兜底拒答。
  const MAX_ATTEMPTS = 2;
  const basePrompt = buildPrompt(question, retrieved);
  let lastRaw = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const prompt =
      attempt === 1
        ? basePrompt
        : `${basePrompt}\n\n注意：你上一次的输出不是合法 JSON 或答案为空。这次只输出符合要求的 JSON，不要输出任何其他内容。`;
    const raw = await generate(prompt);
    lastRaw = raw;
    const payload = extractJsonObject(raw) as LlmAnswerPayload | undefined;
    if (!payload) {
      continue;
    }
    if (payload.abstained === true) {
      return {
        text: typeof payload.answer === "string" && payload.answer ? payload.answer : "证据不足，拒绝编造。",
        citations: [],
        abstained: true,
      };
    }
    const answerText = typeof payload.answer === "string" ? payload.answer.trim() : "";
    if (!answerText) {
      continue;
    }
    return buildAnswer(answerText, payload.citations, retrieved);
  }

  return { text: `模型输出无法解析，拒绝编造。原始输出：${lastRaw.slice(0, 120)}`, citations: [], abstained: true };
}

function buildAnswer(answerText: string, rawCitations: unknown, retrieved: Chunk[]): RagAnswer {
  const rawIndices = Array.isArray(rawCitations) ? rawCitations : [];
  const seen = new Set<number>();
  const citations = rawIndices
    .filter((index): index is number => typeof index === "number" && Number.isInteger(index))
    .filter((index) => index >= 1 && index <= retrieved.length)
    .filter((index) => {
      if (seen.has(index)) {
        return false;
      }
      seen.add(index);
      return true;
    })
    .map((index) => {
      const chunk = retrieved[index - 1];
      return { source: chunk.source, chunkId: chunk.chunkId, quote: chunk.text };
    });

  return { text: answerText, citations, abstained: false };
}
