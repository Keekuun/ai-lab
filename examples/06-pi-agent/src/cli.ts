#!/usr/bin/env node
import { createPiAgent } from "./agent.js";
import { createCalcTool, createGetTimeTool } from "./tools.js";
import { isOllamaReachable } from "./ollama-model.js";

// 交互式 CLI：本地 Ollama + gemma4 驱动的最小 pi agent。
// 用法：node --experimental-strip-types src/cli.ts [--model gemma4:31b]
// 命令：/quit 退出，/abort 中断当前生成，其他输入直接作为 prompt。

const args = process.argv.slice(2);
const modelFlagIndex = args.indexOf("--model");
const modelId = modelFlagIndex >= 0 ? args[modelFlagIndex + 1] : undefined;

if (!(await isOllamaReachable())) {
  console.error("Ollama 不可达，请先运行：brew services start ollama");
  process.exit(1);
}

const { createOllamaModel } = await import("./ollama-model.js");
const agent = createPiAgent({
  model: createOllamaModel(modelId),
  tools: [createCalcTool(), createGetTimeTool()],
});

agent.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
  if (event.type === "tool_execution_start") {
    process.stdout.write(`\n[调用工具 ${event.toolName}]\n`);
  }
  if (event.type === "message_end") {
    process.stdout.write("\n");
  }
});

console.log(`pi agent（模型 ${modelId ?? "gemma4:latest"}，工具 calc/get_time）。/quit 退出，/abort 中断。`);

const readline = await import("node:readline");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "> " });
rl.prompt();

for await (const line of rl) {
  const input = line.trim();
  if (input === "/quit") break;
  if (input === "/abort") {
    await agent.abort();
    rl.prompt();
    continue;
  }
  if (!input) {
    rl.prompt();
    continue;
  }
  try {
    await agent.prompt(input);
  } catch (error) {
    console.error(`[错误] ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!rl.closed) {
    rl.prompt();
  }
}
rl.close();
