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

export type RegisteredResource = {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  risk: RiskLevel;
  read: () => Promise<string>;
};

export type ResourceInfo = {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  risk: RiskLevel;
};

export type PromptMessage = {
  role: "user" | "assistant";
  content: string;
};

export type CapabilityPrompt<TArgs> = {
  name: string;
  description: string;
  risk: RiskLevel;
  schema: z.ZodType<TArgs>;
  render: (args: TArgs) => Promise<PromptMessage[]>;
};

export type PromptInfo = {
  name: string;
  description: string;
  risk: RiskLevel;
};

export function canCall(role: ActorRole, risk: RiskLevel): boolean {
  if (risk === "read") {
    return role === "reader" || role === "writer";
  }
  return role === "writer";
}

export function createCapabilityServer() {
  const tools = new Map<string, RegisteredTool<unknown, unknown>>();
  const resources = new Map<string, RegisteredResource>();
  const prompts = new Map<string, CapabilityPrompt<unknown>>();

  return {
    register<TArgs, TResult>(tool: RegisteredTool<TArgs, TResult>): void {
      assert(tool.name.trim().length > 0, "tool.name 不能为空");
      assert(!tools.has(tool.name), `重复注册：${tool.name}`);
      tools.set(tool.name, tool as RegisteredTool<unknown, unknown>);
    },

    registerResource(resource: RegisteredResource): void {
      assert(resource.uri.trim().length > 0, "resource.uri 不能为空");
      assert(resource.name.trim().length > 0, "resource.name 不能为空");
      assert(!resources.has(resource.uri), `重复注册 Resource：${resource.uri}`);
      resources.set(resource.uri, resource);
    },

    registerPrompt<TArgs>(prompt: CapabilityPrompt<TArgs>): void {
      assert(prompt.name.trim().length > 0, "prompt.name 不能为空");
      assert(!prompts.has(prompt.name), `重复注册 Prompt：${prompt.name}`);
      prompts.set(prompt.name, prompt as CapabilityPrompt<unknown>);
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

    listResources(): ResourceInfo[] {
      return [...resources.values()].map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
        risk: resource.risk,
      }));
    },

    listRegisteredPrompts(): CapabilityPrompt<unknown>[] {
      return [...prompts.values()];
    },

    listPrompts(): PromptInfo[] {
      return [...prompts.values()].map((prompt) => ({
        name: prompt.name,
        description: prompt.description,
        risk: prompt.risk,
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

    async readResource(options: {
      uri: string;
      actor: { role: ActorRole };
    }): Promise<CallResult<string>> {
      const resource = resources.get(options.uri);
      if (!resource) {
        return { ok: false, reason: "not_found" };
      }

      if (!canCall(options.actor.role, resource.risk)) {
        return { ok: false, reason: "forbidden" };
      }

      const data = await resource.read();
      return { ok: true, data };
    },

    async getPrompt(options: {
      name: string;
      args: unknown;
      actor: { role: ActorRole };
    }): Promise<CallResult<{ messages: PromptMessage[] }>> {
      const prompt = prompts.get(options.name);
      if (!prompt) {
        return { ok: false, reason: "not_found" };
      }

      if (!canCall(options.actor.role, prompt.risk)) {
        return { ok: false, reason: "forbidden" };
      }

      const parsed = prompt.schema.safeParse(options.args);
      if (!parsed.success) {
        return {
          ok: false,
          reason: "invalid_args",
          error: parsed.error.message,
        };
      }

      const messages = await prompt.render(parsed.data);
      return { ok: true, data: { messages } };
    },
  };
}
