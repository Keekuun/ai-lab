import { extractJsonObject, type LlmGenerate } from "./llm-answer.js";

// 评判输出的约束解码 schema
export const JUDGE_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    covered: { type: "array", items: { type: "boolean" } },
  },
  required: ["covered"],
};

// LLM 评判：对照 expectedPoints 逐条判断答案是否覆盖，返回 0..1 的覆盖率。
// 对应 29「答案相关性用 LLM 评判」——词重叠只能算字面，语义对不对得上要模型判。
// 解析失败记 0 分：评判宁可严格，不放水。

function buildJudgePrompt(question: string, answerText: string, expectedPoints: string[]): string {
  const points = expectedPoints.map((point, index) => `${index + 1}. ${point}`).join("\n");
  return `你是严格的阅卷人。给定问题、参考答案要点和一份答案，逐条判断答案是否覆盖了每个要点（语义覆盖即可，不要求字面一致）。

只输出 JSON：{"covered": [true, false, ...]}，数组长度必须等于要点条数，顺序对应。

问题：${question}

参考答案要点：
${points}

待评答案：${answerText}`;
}

export async function judgeAnswerRelevance(
  question: string,
  answerText: string,
  expectedPoints: string[],
  generate: LlmGenerate,
): Promise<number> {
  if (expectedPoints.length === 0) {
    return 1;
  }

  const raw = await generate(buildJudgePrompt(question, answerText, expectedPoints));
  const payload = extractJsonObject(raw);
  const covered = payload?.covered;
  if (!Array.isArray(covered)) {
    return 0;
  }

  const hits = expectedPoints.filter((_, index) => covered[index] === true).length;
  return hits / expectedPoints.length;
}
