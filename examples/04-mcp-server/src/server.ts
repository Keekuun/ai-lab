import assert from "node:assert/strict";
import { z, type ZodTypeAny } from "zod";

export type RiskLevel = "read" | "write";
export type ActorRole = "reader" | "writer";

export type Capability = {
  name: string;
  description: string;
  risk: RiskLevel;
  inputSchema: Record<string, unknown>;
};

export type CallResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      reason: "invalid_args" | "forbidden" | "not_found";
      error?: string;
    };

export type RegisteredTool<TArgs, TResult> = {
  name: string;
  description: string;
  risk: RiskLevel;
  schema: z.ZodType<TArgs>;
  handler: (args: TArgs) => Promise<TResult>;
};

function jsonSchemaFromZod(schema: ZodTypeAny): Record<string, unknown> {
  if (!(schema instanceof z.ZodObject)) {
    return { type: "object" };
  }

  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, field] of Object.entries(schema.shape)) {
    const zodField = field as ZodTypeAny;
    properties[key] = { type: "string" };
    if (!zodField.isOptional()) {
      required.push(key);
    }
  }

  return {
    type: "object",
    properties,
    required,
  };
}

export function canCall(role: ActorRole, risk: RiskLevel): boolean {
  if (risk === "read") {
    return role === "reader" || role === "writer";
  }
  return role === "writer";
}

export function createCapabilityServer() {
  const tools = new Map<string, RegisteredTool<unknown, unknown>>();

  return {
    register<TArgs, TResult>(tool: RegisteredTool<TArgs, TResult>): void {
      assert(tool.name.trim().length > 0, "tool.name 不能为空");
      assert(!tools.has(tool.name), `重复注册：${tool.name}`);
      tools.set(tool.name, tool as RegisteredTool<unknown, unknown>);
    },

    listRegistered(): RegisteredTool<unknown, unknown>[] {
      return [...tools.values()];
    },

    listCapabilities(): Capability[] {
      return [...tools.values()].map((tool) => ({
        name: tool.name,
        description: tool.description,
        risk: tool.risk,
        inputSchema: jsonSchemaFromZod(tool.schema),
      }));
    },

    async call<T>(options: {
      name: string;
      args: unknown;
      actor: { role: ActorRole };
    }): Promise<CallResult<T>> {
      const tool = tools.get(options.name);
      if (!tool) {
        return { ok: false, reason: "not_found" };
      }

      if (!canCall(options.actor.role, tool.risk)) {
        return { ok: false, reason: "forbidden" };
      }

      const parsed = tool.schema.safeParse(options.args);
      if (!parsed.success) {
        return {
          ok: false,
          reason: "invalid_args",
          error: parsed.error.message,
        };
      }

      const data = (await tool.handler(parsed.data)) as T;
      return { ok: true, data };
    },
  };
}
