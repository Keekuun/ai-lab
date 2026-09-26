import { Type } from "@sinclair/typebox";

// 演示工具：结构化参数（TypeBox 校验）+ 无 eval 的安全计算。
// calc 用 {a, b, op} 结构化入参，从根上避免表达式注入。

type ToolContent = { type: "text"; text: string };
type ToolResult = { content: ToolContent[]; details: Record<string, unknown> };

export type SimpleTool = {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: (toolCallId: string, params: never) => Promise<ToolResult>;
};

const OPS = {
  add: (a: number, b: number) => a + b,
  sub: (a: number, b: number) => a - b,
  mul: (a: number, b: number) => a * b,
  div: (a: number, b: number) => a / b,
} as const;

type Op = keyof typeof OPS;

export function createCalcTool() {
  return {
    name: "calc",
    label: "Calculator",
    description: "安全计算器：对两个数做四则运算",
    parameters: Type.Object({
      a: Type.Number({ description: "第一个数" }),
      b: Type.Number({ description: "第二个数" }),
      op: Type.Union(
        [Type.Literal("add"), Type.Literal("sub"), Type.Literal("mul"), Type.Literal("div")],
        { description: "运算类型" },
      ),
    }),
    execute: async (_toolCallId: string, params: { a: number; b: number; op: Op }): Promise<ToolResult> => {
      if (params.op === "div" && params.b === 0) {
        return {
          content: [{ type: "text", text: "除数不能为零" }],
          details: { error: true },
        };
      }
      const value = OPS[params.op](params.a, params.b);
      // 保留 6 位小数去尾零，避免 0.30000000000000004 这类浮点噪音进上下文
      const text = String(Number(value.toFixed(6)));
      return { content: [{ type: "text", text }], details: { value } };
    },
  };
}

export function createGetTimeTool(now: () => Date = () => new Date()) {
  return {
    name: "get_time",
    label: "Get Time",
    description: "获取当前时间（ISO 8601）",
    parameters: Type.Object({}),
    execute: async (_toolCallId: string): Promise<ToolResult> => ({
      content: [{ type: "text", text: `现在是 ${now().toISOString()}` }],
      details: {},
    }),
  };
}
