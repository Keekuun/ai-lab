import assert from "node:assert/strict";
import * as acp from "@agentclientprotocol/sdk";
import { describe, it } from "vitest";
import { createEchoAgent } from "../src/agent.js";
import { createTestClient } from "../src/client.js";
import { createMemoryStreamPair, runPromptTurn, textOf } from "./helpers.js";

describe("ACP 权限请求", () => {
  it("触发词发起 tool_call + session/request_permission，allow 后 completed", async () => {
    const { agentStream, clientStream } = createMemoryStreamPair();
    createEchoAgent().connect(agentStream);
    const client = createTestClient({ permission: "allow" });

    await client.app.connectWith(clientStream, async (ctx) => {
      await ctx.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      const { updates, stopReason } = await runPromptTurn(ctx, "帮我修改 config.json");

      assert.equal(stopReason, "end_turn");
      assert.equal(client.permissionRequests.length, 1);
      assert.equal(client.permissionRequests[0].toolCall.kind, "edit");
      assert.ok(
        updates.some(
          (update) =>
            update.sessionUpdate === "tool_call_update" && update.status === "completed",
        ),
      );
    });
  });

  it("reject 后工具不执行，agent 说明已跳过", async () => {
    const { agentStream, clientStream } = createMemoryStreamPair();
    createEchoAgent().connect(agentStream);
    const client = createTestClient({ permission: "reject" });

    await client.app.connectWith(clientStream, async (ctx) => {
      await ctx.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      const { updates } = await runPromptTurn(ctx, "帮我修改 config.json");

      assert.equal(client.permissionRequests.length, 1);
      assert.ok(
        updates.some(
          (update) => update.sessionUpdate === "tool_call_update" && update.status === "failed",
        ),
      );
      assert.match(textOf(updates), /跳过|取消|不.*执行/);
    });
  });

  it("无触发词的普通问题不请求权限", async () => {
    const { agentStream, clientStream } = createMemoryStreamPair();
    createEchoAgent().connect(agentStream);
    const client = createTestClient({ permission: "allow" });

    await client.app.connectWith(clientStream, async (ctx) => {
      await ctx.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      await runPromptTurn(ctx, "今天天气如何");

      assert.equal(client.permissionRequests.length, 0);
    });
  });
});
