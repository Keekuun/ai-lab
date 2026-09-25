import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import { createEchoAgent, type Responder } from "./agent.js";
import { createTestClient } from "./client.js";

// 05 ACP Agent CLI
// 默认：stdio 模式，作为 ACP agent 等待编辑器挂载（Zed 里配 agent_servers 指向本命令）
// --ollama：回复改由本地 gemma4 流式生成（需 ollama serve）
// --demo：不起 stdio，本地内存流自连跑一轮，直接看协议消息流

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gemma4:latest";

function createOllamaResponder(): Responder {
  return async function* ollamaResponder(userText, history) {
    const historyLines = history.map((text) => `用户之前说过：${text}`);
    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: [...historyLines, `用户现在说：${userText}`, "请简洁回答。"].join("\n"),
        stream: true,
        think: false,
      }),
    });
    if (!response.ok || !response.body) {
      throw new Error(`Ollama 请求失败：${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }
        const payload = JSON.parse(line) as { response?: string };
        if (payload.response) {
          yield payload.response;
        }
      }
    }
  };
}

async function runDemo(): Promise<void> {
  const { createMemoryStreamPair } = await import("../test/helpers.js");
  const { agentStream, clientStream } = createMemoryStreamPair();
  const responder = process.argv.includes("--ollama") ? createOllamaResponder() : undefined;
  createEchoAgent({ responder }).connect(agentStream);
  const client = createTestClient({ permission: "allow" });

  await client.app.connectWith(clientStream, async (ctx) => {
    const init = await ctx.request(acp.methods.agent.initialize, {
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {},
      clientInfo: { name: "demo-client", version: "0.1.0" },
    });
    console.error(`握手成功：协议 v${init.protocolVersion}，对端 ${init.agentInfo?.name} v${init.agentInfo?.version}`);

    await ctx.buildSession(process.cwd()).withSession(async (session) => {
      console.error(`会话：${session.sessionId}\n`);
      void session.prompt([{ type: "text", text: "帮我修改 README 的标题" }]);
      for (;;) {
        const message = await session.nextUpdate();
        if (message.kind === "stop") {
          console.error(`\nturn 结束：${message.stopReason}`);
          break;
        }
        const update = message.update;
        if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text") {
          process.stdout.write(update.content.text);
        } else {
          console.error(`[${update.sessionUpdate}] ${JSON.stringify(update).slice(0, 120)}`);
        }
      }
    });
  });
  console.error(`\n权限请求次数：${client.permissionRequests.length}（demo 策略：自动允许）`);
}

if (process.argv.includes("--demo")) {
  await runDemo();
} else {
  // stdio 模式：编辑器（Zed/JetBrains）以子进程方式挂载本 agent
  const responder = process.argv.includes("--ollama") ? createOllamaResponder() : undefined;
  const stream = acp.ndJsonStream(
    Writable.toWeb(process.stdout) as WritableStream<Uint8Array>,
    Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>,
  );
  createEchoAgent({ responder }).connect(stream);
  console.error(`05 ACP agent 已在 stdio 上就绪（${responder ? "ollama " + OLLAMA_MODEL : "本地回显"}）`);
}
