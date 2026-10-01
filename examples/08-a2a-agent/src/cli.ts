#!/usr/bin/env node
import { createA2AServer } from "./server.js";
import { createA2AClient, A2AClientError } from "./client.js";

// A2A 协议演示：内存传输的 client ↔ server 全链路。
// 用法：tsx src/cli.ts

const server = createA2AServer();
const client = createA2AClient(server.handler);

console.log("== 1. AgentCard（发布在 /.well-known/agent-card.json 的发现文档）==");
console.log(JSON.stringify({
  name: server.card.name,
  interface: server.card.supportedInterfaces[0],
  skills: server.card.skills.map((skill) => skill.id),
}, null, 2));

console.log("\n== 2. SendMessage：3+5 ==");
const task = await client.sendMessage("3+5 等于几？");
console.log(`task ${task.id} [${task.status.state}]`);
console.log("agent 回复:", task.status.message?.parts.map((part) => part.text).join(""));

console.log("\n== 3. 同一 contextId 多轮 ==");
const second = await client.sendMessage("10/4", { contextId: task.contextId });
console.log(`task ${second.id} [${second.status.state}] contextId 相同: ${second.contextId === task.contextId}`);
console.log("agent 回复:", second.status.message?.parts.map((part) => part.text).join(""));

console.log("\n== 4. GetTask 查回 ==");
const fetched = await client.getTask(task.id);
console.log(`查回 ${fetched.id} [${fetched.status.state}]`);

console.log("\n== 5. 错误语义 ==");
try {
  await client.cancelTask("task-not-exist");
} catch (error) {
  if (error instanceof A2AClientError) {
    console.log(`取消不存在任务 → A2AClientError(code=${error.code}): ${error.message}`);
  }
}
try {
  await client.cancelTask(task.id);
} catch (error) {
  if (error instanceof A2AClientError) {
    console.log(`取消已完成任务 → A2AClientError(code=${error.code}): ${error.message}`);
  }
}
