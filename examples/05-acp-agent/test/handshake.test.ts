import assert from "node:assert/strict";
import * as acp from "@agentclientprotocol/sdk";
import { describe, it } from "vitest";
import { createEchoAgent } from "../src/agent.js";
import { createTestClient } from "../src/client.js";
import { createMemoryStreamPair } from "./helpers.js";

describe("ACP 握手", () => {
  it("initialize 返回协议版本、能力与 agentInfo", async () => {
    const { agentStream, clientStream } = createMemoryStreamPair();
    createEchoAgent().connect(agentStream);
    const client = createTestClient();

    await client.app.connectWith(clientStream, async (ctx) => {
      const result = await ctx.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
        clientInfo: { name: "test-client", version: "0.0.1" },
      });

      assert.equal(result.protocolVersion, acp.PROTOCOL_VERSION);
      assert.equal(result.agentInfo?.name, "ai-lab-echo-agent");
      assert.ok(result.agentCapabilities);
    });
  });

  it("版本协商：client 报更高版本时 agent 回退到自己支持的版本", async () => {
    const { agentStream, clientStream } = createMemoryStreamPair();
    createEchoAgent().connect(agentStream);
    const client = createTestClient();

    await client.app.connectWith(clientStream, async (ctx) => {
      const result = await ctx.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION + 99,
        clientCapabilities: {},
      });

      assert.equal(result.protocolVersion, acp.PROTOCOL_VERSION);
    });
  });
});
