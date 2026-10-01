import { Role, TaskState, type Message } from "@a2a-js/sdk";
import { AgentEvent, type AgentExecutor, type ExecutionEventBus, type RequestContext } from "@a2a-js/sdk/server";

// 最小 AgentExecutor：把用户文本解析成「数 运算符 数」并计算。
// 安全约束：正则提取结构化参数，绝不用 eval。
//
// 关键认知（spike 实测）：@a2a-js/sdk 内部对象是 ts-proto 形态——
// 枚举是数字（TaskState.TASK_STATE_COMPLETED）、Part 是 oneof
// （{ content: { $case: "text", value } }）。JSON 层的 "TASK_STATE_COMPLETED"
// 字符串只在 transport 序列化边界出现，executor 里必须用枚举值。
//
// 事件序列（SDK 强制首事件必须是 task 或 message）：
//   task(submitted) → statusUpdate(working) → statusUpdate(completed + message) → finished

const EXPRESSION_PATTERN = /(-?\d+(?:\.\d+)?)\s*([+\-*/×÷])\s*(-?\d+(?:\.\d+)?)/;

const OPERATORS: Record<string, (a: number, b: number) => number> = {
  "+": (a, b) => a + b,
  "-": (a, b) => a - b,
  "*": (a, b) => a * b,
  "×": (a, b) => a * b,
  "/": (a, b) => a / b,
  "÷": (a, b) => a / b,
};

function extractText(context: RequestContext): string {
  return context.userMessage.parts
    .map((part) => (part.content?.$case === "text" ? part.content.value : ""))
    .join(" ")
    .trim();
}

function textPart(text: string) {
  // undefined! 同 agent-card.ts 的 ts-proto 怪癖说明
  return { content: { $case: "text" as const, value: text }, metadata: undefined!, filename: undefined!, mediaType: undefined! };
}

function agentMessage(contextId: string, text: string): Message {
  return {
    messageId: crypto.randomUUID(),
    contextId,
    role: Role.ROLE_AGENT,
    parts: [textPart(text)],
    taskId: undefined!,
    metadata: undefined!,
    extensions: undefined!,
    referenceTaskIds: undefined!,
  };
}

export function createCalcExecutor(): AgentExecutor {
  return {
    execute: async (requestContext, eventBus) => {
      const { taskId, contextId } = requestContext;
      const now = () => new Date().toISOString();

      eventBus.publish(
        AgentEvent.task({
          id: taskId,
          contextId,
          status: { state: TaskState.TASK_STATE_SUBMITTED, message: undefined, timestamp: now() },
          history: [requestContext.userMessage],
          artifacts: [],
          metadata: {},
        }),
      );
      eventBus.publish(
        AgentEvent.statusUpdate({
          taskId,
          contextId,
          status: { state: TaskState.TASK_STATE_WORKING, message: undefined, timestamp: now() },
          metadata: {},
        }),
      );

      const text = extractText(requestContext);
      const match = EXPRESSION_PATTERN.exec(text);
      let reply: string;
      if (!match) {
        reply = `无法计算「${text}」：请提供形如 3+5 的四则运算表达式`;
      } else {
        const [, aRaw, op, bRaw] = match;
        const a = Number(aRaw);
        const b = Number(bRaw);
        if ((op === "/" || op === "÷") && b === 0) {
          reply = "无法计算：除数为零";
        } else {
          const value = OPERATORS[op](a, b);
          reply = `${a} ${op} ${b} = ${Number(value.toFixed(6))}`;
        }
      }

      eventBus.publish(
        AgentEvent.statusUpdate({
          taskId,
          contextId,
          status: { state: TaskState.TASK_STATE_COMPLETED, message: agentMessage(contextId, reply), timestamp: now() },
          metadata: {},
        }),
      );
      eventBus.finished();
    },

    cancelTask: async (taskId, eventBus) => {
      // 本 executor 同步完成，没有可中断的异步工作；协议层（DefaultRequestHandler）
      // 会在任务不存在/已终态时先拒绝，走到这里说明任务仍在运行。
      eventBus.publish(
        AgentEvent.statusUpdate({
          taskId,
          contextId: "",
          status: { state: TaskState.TASK_STATE_CANCELED, message: undefined, timestamp: new Date().toISOString() },
          metadata: {},
        }),
      );
      eventBus.finished();
    },
  };
}
