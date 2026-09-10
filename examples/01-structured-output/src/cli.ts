import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractStructured, type GenerateText } from "./extract.js";
import { ticketSchema } from "./ticket-schema.js";

function loadDotEnv(fileName: string): void {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) {
    return;
  }

  for (const rawLine of readFileSync(filePath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv(".env");

const DEFAULT_SOURCE_TEXT = "登录会在两分钟后掉线，优先修，大约两天内要搞定。";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

function readFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const matched = process.argv.find((argument) => argument.startsWith(prefix));
  return matched?.slice(prefix.length);
}

function createDemoGenerate(): GenerateText {
  let calls = 0;

  return async () => {
    calls += 1;
    if (calls === 1) {
      return JSON.stringify({
        title: "登录超时",
        priority: "urgent",
        tags: [],
      });
    }

    return JSON.stringify({
      title: "修复登录超时",
      priority: "high",
      tags: ["auth", "bug"],
      dueInDays: 2,
    });
  };
}

function createOpenAiGenerate(apiKey: string): GenerateText {
  const baseUrl = process.env.OPENAI_BASE_URL ?? DEFAULT_OPENAI_BASE_URL;
  const model = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;

  return async (prompt) => {
    const startedAt = Date.now();
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI 请求失败：${response.status} ${await response.text()}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI 返回空内容");
    }

    const latencyMs = Date.now() - startedAt;
    const inputTokens = payload.usage?.prompt_tokens ?? 0;
    const outputTokens = payload.usage?.completion_tokens ?? 0;
    console.error(
      `[cost] model=${model} latencyMs=${latencyMs} inputTokens=${inputTokens} outputTokens=${outputTokens}`,
    );
    return content;
  };
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const sourceText = readFlag("text") ?? DEFAULT_SOURCE_TEXT;
  const generate = apiKey ? createOpenAiGenerate(apiKey) : createDemoGenerate();

  if (!apiKey) {
    console.error("未设置 OPENAI_API_KEY，使用本地演示：第一次非法 JSON，第二次恢复。");
  }

  const result = await extractStructured({
    generate,
    schema: ticketSchema,
    sourceText,
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 1;
  }
}

await main();
