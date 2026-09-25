import * as acp from "@agentclientprotocol/sdk";

// 最小 ACP Agent：演示协议全生命周期——
// initialize 版本协商 → session/new → session/prompt 流式回复 →
// 敏感操作 request_permission → session/cancel 真取消。
//
// responder 可注入：默认本地回显（零依赖可测试）；
// CLI --ollama 模式注入 gemma4 流式生成，同一套协议代码接真实模型。

export type Responder = (userText: string, history: string[]) => AsyncIterable<string>;

export type EchoAgentOptions = {
  responder?: Responder;
  agentName?: string;
  agentVersion?: string;
};

// 触发权限演示的关键词：涉及修改/删除类意图时走 request_permission 流程
const PERMISSION_TRIGGER = /修改|删除|delete|edit|write/i;

const DEFAULT_AGENT_NAME = "ai-lab-echo-agent";
const DEFAULT_AGENT_VERSION = "0.1.0";
const ECHO_CHUNK_SIZE = 8;

async function* defaultResponder(userText: string): AsyncIterable<string> {
  const reply = `收到：「${userText}」。这是本地回显，未接模型；用 --ollama 接 gemma4。`;
  for (let index = 0; index < reply.length; index += ECHO_CHUNK_SIZE) {
    yield reply.slice(index, index + ECHO_CHUNK_SIZE);
  }
}

type SessionState = {
  history: string[];
  pendingPrompt: AbortController | null;
};

export function createEchoAgent(options: EchoAgentOptions = {}) {
  const responder = options.responder ?? defaultResponder;
  const agentName = options.agentName ?? DEFAULT_AGENT_NAME;
  const agentVersion = options.agentVersion ?? DEFAULT_AGENT_VERSION;
  const sessions = new Map<string, SessionState>();

  function requireSession(sessionId: string): SessionState {
    const session = sessions.get(sessionId);
    if (!session) {
      throw acp.RequestError.invalidParams(`会话不存在：${sessionId}`);
    }
    return session;
  }

  async function runPromptTurn(
    params: acp.PromptRequest,
    client: acp.AgentContext,
  ): Promise<acp.PromptResponse> {
    const session = requireSession(params.sessionId);
    // 同一 session 已有进行中的 turn：先取消旧的（协议不禁止并发 prompt，但演示串行语义更清晰）
    session.pendingPrompt?.abort();
    session.pendingPrompt = new AbortController();
    const { signal } = session.pendingPrompt;

    const userText = params.prompt
      .filter((block) => block.type === "text")
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("\n");

    try {
      // 敏感操作：先发 tool_call，再向 client 请求权限
      if (PERMISSION_TRIGGER.test(userText)) {
        const permitted = await requestEditPermission(params.sessionId, userText, client, signal);
        if (signal.aborted) {
          return { stopReason: "cancelled" };
        }
        if (!permitted) {
          await sendText(params.sessionId, client, "已跳过该修改，未执行任何写入。");
          session.history.push(userText);
          return { stopReason: "end_turn" };
        }
      }

      for await (const chunk of responder(userText, session.history)) {
        if (signal.aborted) {
          return { stopReason: "cancelled" };
        }
        await sendText(params.sessionId, client, chunk);
      }

      session.history.push(userText);
      return { stopReason: "end_turn" };
    } finally {
      session.pendingPrompt = null;
    }
  }

  async function sendText(sessionId: string, client: acp.AgentContext, text: string): Promise<void> {
    await client.notify(acp.methods.client.session.update, {
      sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text },
      },
    });
  }

  async function requestEditPermission(
    sessionId: string,
    userText: string,
    client: acp.AgentContext,
    signal: AbortSignal,
  ): Promise<boolean> {
    const toolCallId = `call_${Date.now()}`;
    await client.notify(acp.methods.client.session.update, {
      sessionId,
      update: {
        sessionUpdate: "tool_call",
        toolCallId,
        title: `修改文件（由「${userText.slice(0, 20)}」触发）`,
        kind: "edit",
        status: "pending",
        rawInput: { instruction: userText },
      },
    });

    const permission = await client.request(acp.methods.client.session.requestPermission, {
      sessionId,
      toolCall: {
        toolCallId,
        title: "修改工作区文件",
        kind: "edit",
        status: "pending",
        rawInput: { instruction: userText },
      },
      options: [
        { optionId: "allow", name: "允许本次修改", kind: "allow_once" },
        { optionId: "reject", name: "拒绝", kind: "reject_once" },
      ],
    });

    if (signal.aborted || permission.outcome.outcome === "cancelled") {
      return false;
    }
    const allowed = permission.outcome.outcome === "selected" && permission.outcome.optionId === "allow";
    await client.notify(acp.methods.client.session.update, {
      sessionId,
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId,
        status: allowed ? "completed" : "failed",
      },
    });
    return allowed;
  }

  return acp
    .agent({ name: agentName })
    .onRequest("initialize", (ctx) => {
      const requested = (ctx.params as acp.InitializeRequest).protocolVersion;
      return {
        // 版本协商：client 报的版本高于自己时，回退到自己支持的最新版
        protocolVersion: Math.min(requested, acp.PROTOCOL_VERSION),
        agentCapabilities: { loadSession: false },
        agentInfo: { name: agentName, title: "AI Lab Echo Agent", version: agentVersion },
        authMethods: [],
      } satisfies acp.InitializeResponse;
    })
    .onRequest("session/new", () => {
      const sessionId = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      sessions.set(sessionId, { history: [], pendingPrompt: null });
      return { sessionId } satisfies acp.NewSessionResponse;
    })
    .onRequest("session/prompt", (ctx) => runPromptTurn(ctx.params, ctx.client))
    .onNotification("session/cancel", (ctx) => {
      sessions.get(ctx.params.sessionId)?.pendingPrompt?.abort();
    });
}
