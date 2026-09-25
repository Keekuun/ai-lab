import assert from "node:assert/strict";
import * as acp from "@agentclientprotocol/sdk";
import { describe, it } from "vitest";
import { createEchoAgent } from "../src/agent.js";
import { createTestClient } from "../src/client.js";
import { createMemoryStreamPair, runPromptTurn, textOf } from "./helpers.js";

describe("ACP prompt turn", () => {
  it("默认回显：流式收到 agent_message_chunk，stopReason 为 end_turn", async () => {
    const { agentStream, clientStream } = createMemoryStreamPair();
    createEchoAgent().connect(agentStream);
    const client = createTestClient();

    await client.app.connectWith(clientStream, async (ctx) => {
      await ctx.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      const { updates, stopReason } = await runPromptTurn(ctx, "你好 ACP");

      assert.equal(stopReason, "end_turn");
      assert.ok(updates.some((update) => update.sessionUpdate === "agent_message_chunk"));
      assert.match(textOf(updates), /你好 ACP/);
    });
  });

  it("注入的 responder 收到用户原文，自定义 chunk 按序到达", async () => {
    const seen: string[] = [];
    async function* responder(userText: string): AsyncIterable<string> {
      seen.push(userText);
      yield "第一段-";
      yield "第二段-";
      yield "第三段";
    }
    const { agentStream, clientStream } = createMemoryStreamPair();
    createEchoAgent({ responder }).connect(agentStream);
    const client = createTestClient();

    await client.app.connectWith(clientStream, async (ctx) => {
      await ctx.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      const { updates } = await runPromptTurn(ctx, "测试输入");

      assert.deepEqual(seen, ["测试输入"]);
      assert.equal(textOf(updates), "第一段-第二段-第三段");
    });
  });

  it("同一会话第二轮 prompt 时 responder 拿到历史", async () => {
    const histories: string[][] = [];
    async function* responder(userText: string, history: string[]): AsyncIterable<string> {
      histories.push([...history]);
      yield userText;
    }
    const { agentStream, clientStream } = createMemoryStreamPair();
    createEchoAgent({ responder }).connect(agentStream);
    const client = createTestClient();

    await client.app.connectWith(clientStream, async (ctx) => {
      await ctx.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      await ctx.buildSession("/tmp/ai-lab-acp-test").withSession(async (session) => {
        for (const text of ["第一轮", "第二轮"]) {
          void session.prompt([{ type: "text", text }]);
          for (;;) {
            const message = await session.nextUpdate();
            if (message.kind === "stop") {
              break;
            }
          }
        }
      });

      assert.deepEqual(histories, [[], ["第一轮"]]);
    });
  });
});
