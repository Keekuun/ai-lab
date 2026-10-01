import type { JsonRpcTransportHandler, ServerCallContext } from "@a2a-js/sdk/server";
import { defaultServerCallContextBuilder } from "@a2a-js/sdk/server";

// 内存版 A2A client：把 JSON-RPC 请求直接喂给 server 的 transport.handle，
// 不走网络。接口形态与真实 HTTP client 一致（方法名/参数/错误语义），
// 换成远程 agent 时只需把 callRpc 换成 fetch。
//
// 协议边界上的两个 JSON 细节（spike 实测）：
// 1. 请求里枚举要用 proto 名（"ROLE_USER"），不是 v0.x 的 "user"
// 2. SendMessage 响应是 oneof 包装：{ task: {...} } 或 { message: {...} }
// 这里把 TASK_STATE_* 规范化为小写友好形态，屏蔽 proto 噪音。

export class A2AClientError extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
    this.name = "A2AClientError";
  }
}

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: unknown };
};

export type FriendlyTask = {
  id: string;
  contextId: string;
  status: {
    state: string;
    message?: { parts: Array<{ text?: string }> };
  };
};

export type A2AClient = {
  sendMessage: (text: string, options?: { contextId?: string }) => Promise<FriendlyTask>;
  getTask: (taskId: string) => Promise<FriendlyTask>;
  cancelTask: (taskId: string) => Promise<FriendlyTask>;
};

function normalizeState(state: unknown): string {
  if (typeof state !== "string") return String(state);
  return state.replace(/^TASK_STATE_/, "").toLowerCase();
}

function normalizeTask(raw: Record<string, unknown>): FriendlyTask {
  const task = (raw.task ?? raw) as Record<string, unknown>;
  const status = (task.status ?? {}) as Record<string, unknown>;
  return {
    id: String(task.id),
    contextId: String(task.contextId),
    status: {
      state: normalizeState(status.state),
      message: status.message as FriendlyTask["status"]["message"],
    },
  };
}

export function createA2AClient(
  handler: JsonRpcTransportHandler,
  buildContext: () => ServerCallContext = () =>
    defaultServerCallContextBuilder({ extensions: undefined, user: undefined, headers: {} }),
): A2AClient {
  let nextId = 0;

  async function callRpc(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const body = { jsonrpc: "2.0" as const, id: ++nextId, method, params };
    const response = (await handler.handle(body, buildContext())) as JsonRpcResponse;
    if (response.error) {
      throw new A2AClientError(response.error.message, response.error.code);
    }
    return response.result ?? {};
  }

  return {
    sendMessage: async (text, options) => {
      const result = await callRpc("SendMessage", {
        message: {
          messageId: crypto.randomUUID(),
          role: "ROLE_USER",
          parts: [{ text }],
          ...(options?.contextId ? { contextId: options.contextId } : {}),
        },
      });
      return normalizeTask(result);
    },

    getTask: async (taskId) => {
      const result = await callRpc("GetTask", { id: taskId });
      return normalizeTask(result);
    },

    cancelTask: async (taskId) => {
      const result = await callRpc("CancelTask", { id: taskId });
      return normalizeTask(result);
    },
  };
}
