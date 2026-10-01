import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createCalcAgentCard } from "../src/agent-card.js";
import { createA2AServer } from "../src/server.js";
import { createA2AClient, A2AClientError } from "../src/client.js";

function makeClientPair() {
  const server = createA2AServer();
  const client = createA2AClient(server.handler);
  return { server, client };
}

describe("AgentCard（v1.0 发现文档）", () => {
  it("包含 supportedInterfaces / capabilities / skills", () => {
    const card = createCalcAgentCard("http://localhost:9999/a2a");
    assert.equal(card.name, "calc-agent");
    assert.equal(card.supportedInterfaces[0].protocolBinding, "JSONRPC");
    assert.equal(card.supportedInterfaces[0].protocolVersion, "1.0");
    assert.equal(card.supportedInterfaces[0].url, "http://localhost:9999/a2a");
    assert.ok(card.skills.some((skill) => skill.id === "arithmetic"));
    assert.ok(card.capabilities);
  });
});

describe("A2A SendMessage / GetTask（内存传输）", () => {
  it("发送可计算表达式：任务走到 completed 且带结果", async () => {
    const { client } = makeClientPair();
    const task = await client.sendMessage("3+5");

    assert.equal(task.status.state, "completed");
    const text = task.status.message?.parts.map((part) => ("text" in part ? part.text : "")).join("");
    assert.ok(text?.includes("8"), `结果应含 8，实际: ${text}`);
    assert.ok(task.id);
    assert.ok(task.contextId);
  });

  it("GetTask 按 id 查回同一任务", async () => {
    const { client } = makeClientPair();
    const created = await client.sendMessage("10/4");
    const fetched = await client.getTask(created.id);

    assert.equal(fetched.id, created.id);
    assert.equal(fetched.contextId, created.contextId);
    assert.equal(fetched.status.state, "completed");
  });

  it("无法解析的输入：任务 completed 并说明原因（不抛异常）", async () => {
    const { client } = makeClientPair();
    const task = await client.sendMessage("你好呀");

    assert.equal(task.status.state, "completed");
    const text = task.status.message?.parts.map((part) => ("text" in part ? part.text : "")).join("");
    assert.match(text ?? "", /无法|不支持|格式/);
  });

  it("同一 contextId 可发起多轮对话", async () => {
    const { client } = makeClientPair();
    const first = await client.sendMessage("1+1");
    const second = await client.sendMessage("2+2", { contextId: first.contextId });

    assert.equal(second.contextId, first.contextId);
    assert.notEqual(second.id, first.id);
  });

  it("取消不存在的任务：抛 TaskNotFound 错误", async () => {
    const { client } = makeClientPair();
    await assert.rejects(
      () => client.cancelTask("task-not-exist"),
      (error: unknown) => {
        assert.ok(error instanceof A2AClientError);
        assert.match(error.message, /not found|不存在/i);
        return true;
      },
    );
  });

  it("取消已完成的任务：抛 TaskNotCancelable 错误", async () => {
    const { client } = makeClientPair();
    const task = await client.sendMessage("7*6");
    assert.equal(task.status.state, "completed");

    await assert.rejects(
      () => client.cancelTask(task.id),
      (error: unknown) => {
        assert.ok(error instanceof A2AClientError);
        assert.match(error.message, /cancel|取消/i);
        return true;
      },
    );
  });
});
