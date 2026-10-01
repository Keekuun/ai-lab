import type { AgentCard } from "@a2a-js/sdk";

// A2A v1.0 AgentCard：agent 的「名片」，发布在 /.well-known/agent-card.json。
// v1.0 结构要点（相对 0.x 的 breaking changes）：
// - url/protocolVersion 移到 supportedInterfaces[] 每项里
// - preferredTransport/additionalInterfaces 合并进 supportedInterfaces
// - supportsAuthenticatedExtendedCard 移到 capabilities.extendedAgentCard

// ts-proto 类型怪癖：proto3 optional 字段在 .d.ts 里声明为非空（tenant: string），
// 但运行时的「缺省」就是 undefined。这里用 undefined! 显式标记「协议层缺省」。
export function createCalcAgentCard(endpointUrl: string): AgentCard {
  return {
    name: "calc-agent",
    description: "最小计算器 agent：解析中文/符号四则运算表达式并返回结果",
    version: "0.1.0",
    supportedInterfaces: [
      {
        url: endpointUrl,
        protocolBinding: "JSONRPC",
        protocolVersion: "1.0",
        tenant: undefined!,
      },
    ],
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false,
      extensions: undefined!,
    },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    provider: undefined!,
    securitySchemes: undefined!,
    securityRequirements: undefined!,
    signatures: undefined!,
    skills: [
      {
        id: "arithmetic",
        name: "四则运算",
        description: "计算形如 3+5、10/4 的表达式",
        tags: ["calc", "math"],
        examples: ["3+5 等于几", "10/4"],
        inputModes: undefined!,
        outputModes: undefined!,
        securityRequirements: undefined!,
      },
    ],
  };
}
