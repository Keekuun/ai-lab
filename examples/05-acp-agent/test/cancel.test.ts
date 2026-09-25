import assert from "node:assert/strict";
import * as acp from "@agentclientprotocol/sdk";
import { describe, it } from "vitest";
import { createEchoAgent } from "../src/agent.js";
import { createTestClient } from "../src/client.js";
import { createMemoryStreamPair } from "./helpers.js";

describe("ACP 取消", () => {
  it("prompt 进行中收到 session/cancel，stopReason 为 cancelled", async () => {
    // 慢 responder：每个 chunk 间隔 50ms，足够 client 发出 cancel
    async function* slowResponder(): AsyncIterable<string> {
      for (let index = 0; index < 100; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        yield `chunk-${index}`;
      }
    }
    const { agentStream, clientStream } = createMemoryStreamPair();
    createEchoAgent({ responder: slowResponder }).connect(agentStream);
    const client = createTestClient();

    await client.app.connectWith(clientStream, async (ctx) => {
      await ctx.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      const stopReason = await ctx
        .buildSession("/tmp/ai-lab-acp-test")
        .withSession(async (session) => {
          void session.prompt([{ type: "text", text: "讲个长故事" }]);
          // 等第一个 chunk 到达后取消
          for (;;) {
            const message = await session.nextUpdate();
            if (message.kind === "stop") {
              return message.stopReason;
            }
            await ctx.notify(acp.methods.agent.session.cancel, { sessionId: session.sessionId });
          }
        });

      assert.equal(stopReason, "cancelled");
    });
  });
});
