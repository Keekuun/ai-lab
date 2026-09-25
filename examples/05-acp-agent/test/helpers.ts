import * as acp from "@agentclientprotocol/sdk";

// 测试用内存流对：ACP 是 JSON-RPC over 双向流，
// 两条 TransformStream 对接 client 与 agent，不起进程、不开端口。
export function createMemoryStreamPair(): { agentStream: acp.Stream; clientStream: acp.Stream } {
  const clientToAgent = new TransformStream<Uint8Array, Uint8Array>();
  const agentToClient = new TransformStream<Uint8Array, Uint8Array>();
  return {
    // ndJsonStream(写出, 读入)
    agentStream: acp.ndJsonStream(agentToClient.writable, clientToAgent.readable),
    clientStream: acp.ndJsonStream(clientToAgent.writable, agentToClient.readable),
  };
}

export type PromptTurnResult = {
  updates: acp.SessionUpdate[];
  stopReason: acp.StopReason;
};

// 完整跑一轮 prompt 并收集全部 session/update，直到 stop
export async function runPromptTurn(
  ctx: acp.ClientContext,
  text: string,
): Promise<PromptTurnResult> {
  const updates: acp.SessionUpdate[] = [];
  const stopReason = await ctx.buildSession("/tmp/ai-lab-acp-test").withSession(async (session) => {
    void session.prompt([{ type: "text", text }]);
    for (;;) {
      const message = await session.nextUpdate();
      if (message.kind === "stop") {
        return message.stopReason;
      }
      updates.push(message.update);
    }
  });
  return { updates, stopReason };
}

export function textOf(updates: acp.SessionUpdate[]): string {
  return updates
    .filter((update) => update.sessionUpdate === "agent_message_chunk")
    .map((update) => (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text" ? update.content.text : ""))
    .join("");
}
