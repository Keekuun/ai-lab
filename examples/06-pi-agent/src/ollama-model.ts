import type { Model } from "@mariozechner/pi-ai";

// Ollama 本地模型接入 pi-ai：Ollama 提供 OpenAI 兼容端点（/v1/chat/completions），
// pi-ai 的 openai-completions API 类型直接可用。
// 注意两个坑（spike 实测）：
// 1. pi-ai 的 envMap 没有 ollama provider，getEnvApiKey 拿不到 key 会直接抛错，
//    必须用 Agent.getApiKey 钩子返回占位值（Ollama 服务端不校验）。
// 2. gemma4 的思考内容走 reasoning 字段，不影响 tool calling。

export const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
export const OLLAMA_MODEL_ID = process.env.OLLAMA_MODEL ?? "gemma4:latest";

export function createOllamaModel(modelId: string = OLLAMA_MODEL_ID): Model<"openai-completions"> {
  return {
    id: modelId,
    name: `${modelId} (Ollama)`,
    api: "openai-completions",
    provider: "ollama",
    baseUrl: `${OLLAMA_HOST}/v1`,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxTokens: 2048,
  };
}

export async function isOllamaReachable(host: string = OLLAMA_HOST): Promise<boolean> {
  try {
    const response = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(3_000) });
    return response.ok;
  } catch {
    return false;
  }
}
