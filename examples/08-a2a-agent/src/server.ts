import type { AgentCard } from "@a2a-js/sdk";
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
  JsonRpcTransportHandler,
  defaultServerCallContextBuilder,
  type ServerCallContext,
} from "@a2a-js/sdk/server";
import { createCalcAgentCard } from "./agent-card.js";
import { createCalcExecutor } from "./executor.js";

// A2A server 组装：AgentCard + TaskStore + AgentExecutor → DefaultRequestHandler
// → JsonRpcTransportHandler。transport.handle() 接受 JSON-RPC body 对象，
// 不起 HTTP 端口也能跑完整协议（测试与演示都走这条内存路径）。

export type A2AServer = {
  card: AgentCard;
  handler: JsonRpcTransportHandler;
  buildContext: () => ServerCallContext;
};

export function createA2AServer(endpointUrl = "http://localhost:9999/a2a"): A2AServer {
  const card = createCalcAgentCard(endpointUrl);
  const requestHandler = new DefaultRequestHandler(card, new InMemoryTaskStore(), createCalcExecutor());
  const handler = new JsonRpcTransportHandler(requestHandler);
  // builder 需要一个 options 对象（字段值可 undefined，但键必须存在）
  return {
    card,
    handler,
    buildContext: () => defaultServerCallContextBuilder({ extensions: undefined, user: undefined, headers: {} }),
  };
}
