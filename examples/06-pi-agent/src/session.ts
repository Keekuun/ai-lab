import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { Model } from "@mariozechner/pi-ai";
import {
  AuthStorage,
  ModelRegistry,
  SessionManager,
  createAgentSession,
  type AgentSession,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { createOllamaModel } from "./ollama-model.js";

// pi-coding-agent 深嵌入封装：createAgentSession 提供完整会话能力
// （持久化、Skills、steer/followUp、compaction），比裸 new Agent 多一层。
//
// 隔离要点（测试/嵌入都该这么做）：
// - agentDir 指向临时目录：默认会读 ~/.pi/agent 的用户配置与扩展
// - SessionManager.inMemory()：会话不落盘
// - AuthStorage.inMemory() / ModelRegistry.inMemory()：不碰真实凭证
//
// mock 入口：session.agent 是暴露的 Agent 实例，streamFn/getApiKey 钩子
// 与浅嵌入（06 的 createPiAgent）完全同一套打法。

export type PiSessionOptions = {
  model?: Model<"openai-completions">;
  customTools?: ToolDefinition[];
  streamFn?: StreamFn;
  systemPrompt?: string;
};

export async function createPiSession(options: PiSessionOptions = {}): Promise<AgentSession> {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-session-"));
  const authStorage = AuthStorage.inMemory();
  // session 层在 prompt 前走 modelRegistry.getApiKeyAndHeaders 校验凭证，
  // 不看 agent.getApiKey 钩子——所以除了钩子还要预置 runtime key
  authStorage.setRuntimeApiKey("ollama", "ollama");
  const { session } = await createAgentSession({
    agentDir,
    cwd: agentDir,
    authStorage,
    modelRegistry: ModelRegistry.inMemory(authStorage),
    sessionManager: SessionManager.inMemory(),
    model: options.model ?? createOllamaModel(),
    customTools: (options.customTools ?? []) as ToolDefinition[],
    // 关掉内置 read/bash/edit/write：演示环境只需要自定义工具
    tools: [],
  });
  // 与浅嵌入相同的两个钩子（原因见 ollama-model.ts 注释）
  session.agent.getApiKey = () => "ollama";
  if (options.streamFn) {
    session.agent.streamFn = options.streamFn;
  }
  // mock 场景必须关自动 compaction：compaction 走 session 自己的模型调用路径
  // （真实 HTTP），不经过 agent.streamFn，假 provider 下会永远挂起
  session.settingsManager.setCompactionEnabled(false);
  return session;
}
