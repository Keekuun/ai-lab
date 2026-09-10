import assert from "node:assert/strict";
import type { z } from "zod";

export type GenerateText = (prompt: string) => Promise<string>;

export type ExtractSuccess<T> = {
  ok: true;
  data: T;
  attempts: number;
};

export type ExtractFailure = {
  ok: false;
  error: string;
  attempts: number;
  lastRaw: string;
};

export type ExtractResult<T> = ExtractSuccess<T> | ExtractFailure;

const DEFAULT_MAX_ATTEMPTS = 3;

export function parseJsonFromModelText(raw: string): unknown {
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fencedMatch?.[1] ?? raw).trim();
  return JSON.parse(candidate);
}

function describeParseError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function buildPrompt(sourceText: string, lastError?: string): string {
  const basePrompt = [
    "从下面的文本提取工单 JSON。只输出 JSON，不要解释。",
    "字段：title(string)、priority(low|medium|high)、tags(非空字符串数组)、dueInDays(正整数)。",
    "",
    "文本：",
    sourceText,
  ].join("\n");

  if (!lastError) {
    return basePrompt;
  }

  return [
    basePrompt,
    "",
    "上一次输出不合法，错误：",
    lastError,
    "请按字段约束修正后重新输出 JSON。",
  ].join("\n");
}

export async function extractStructured<T>(options: {
  generate: GenerateText;
  schema: z.ZodType<T>;
  sourceText: string;
  maxAttempts?: number;
}): Promise<ExtractResult<T>> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  assert(maxAttempts >= 1, "maxAttempts 必须 >= 1");
  assert(options.sourceText.trim().length > 0, "sourceText 不能为空");

  let lastError = "";
  let lastRaw = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const prompt = buildPrompt(options.sourceText, lastError || undefined);
    lastRaw = await options.generate(prompt);

    try {
      const parsed = parseJsonFromModelText(lastRaw);
      const data = options.schema.parse(parsed);
      return { ok: true, data, attempts: attempt };
    } catch (error) {
      lastError = describeParseError(error);
    }
  }

  return {
    ok: false,
    error: lastError,
    attempts: maxAttempts,
    lastRaw,
  };
}
