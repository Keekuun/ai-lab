import { Agent, type StreamFn } from "@mariozechner/pi-agent-core";
import type { Model } from "@mariozechner/pi-ai";
import { createOllamaModel } from "./ollama-model.js";

// 对 pi-agent-core 的最小封装：接好 Ollama 鉴权钩子，默认走本地模型。
// streamFn 可注入——单测用剧本式假流，CI 不依赖 Ollama；生产留空走真实 provider。

export type PiAgentOptions = {
  model?: Model<"openai-completions">;
  tools?: Array<Record<string, unknown>>;
  systemPrompt?: string;
  streamFn?: StreamFn;
};

const DEFAULT_SYSTEM_PROMPT = "你是简洁的中文助手。需要计算或查时间时调用对应工具，不要自己编。";

export function createPiAgent(options: PiAgentOptions = {}): Agent {
  const agent = new Agent({
    initialState: {
      systemPrompt: options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      model: options.model ?? createOllamaModel(),
      tools: (options.tools ?? []) as never,
    },
    ...(options.streamFn ? { streamFn: options.streamFn } : {}),
  });
  // Ollama 不校验 key，但 pi-ai 强制要求存在（envMap 无 ollama，见 ollama-model.ts）
  agent.getApiKey = () => "ollama";
  return agent;
}
