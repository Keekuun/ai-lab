import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
      reason: "invalid_args" | "forbidden" | "not_found" | "timeout";
      error?: string;
    };

export type AuditEvent = {
  kind: "tool" | "resource" | "prompt";
  name: string;
  role: ActorRole;
  ok: boolean;
  reason?: string;
  durationMs: number;
  requestId: string;
};

export type CapabilityServerOptions = {
  timeoutMs?: number;
  onAudit?: (event: AuditEvent) => void;
};

const DEFAULT_TIMEOUT_MS = 10_000;

function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, timeoutMs);
    void run(controller.signal).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export type RegisteredTool<TArgs, TResult> = {
  name: string;
  description: string;
  risk: RiskLevel;
  schema: z.ZodType<TArgs>;
  handler: (args: TArgs, ctx: { signal: AbortSignal }) => Promise<TResult>;
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

export function createCapabilityServer(options: CapabilityServerOptions = {}) {
  const tools = new Map<string, RegisteredTool<unknown, unknown>>();
  const resources = new Map<string, RegisteredResource>();
  const prompts = new Map<string, CapabilityPrompt<unknown>>();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  assert(timeoutMs > 0, "timeoutMs 必须 > 0");

  function audit(
    event: Omit<AuditEvent, "durationMs" | "requestId">,
    startedAt: number,
    requestId: string,
  ): void {
    options.onAudit?.({ ...event, durationMs: Date.now() - startedAt, requestId });
  }

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

    async call<T>(callOptions: {
      name: string;
      args: unknown;
      actor: { role: ActorRole };
      requestId?: string;
    }): Promise<CallResult<T>> {
      const startedAt = Date.now();
      const requestId = callOptions.requestId ?? randomUUID();
      const base = { kind: "tool" as const, name: callOptions.name, role: callOptions.actor.role };
      const tool = tools.get(callOptions.name);
      if (!tool) {
        audit({ ...base, ok: false, reason: "not_found" }, startedAt, requestId);
        return { ok: false, reason: "not_found" };
      }

      if (!canCall(callOptions.actor.role, tool.risk)) {
        audit({ ...base, ok: false, reason: "forbidden" }, startedAt, requestId);
        return { ok: false, reason: "forbidden" };
      }

      const parsed = tool.schema.safeParse(callOptions.args);
      if (!parsed.success) {
        audit({ ...base, ok: false, reason: "invalid_args" }, startedAt, requestId);
        return {
          ok: false,
          reason: "invalid_args",
          error: parsed.error.message,
        };
      }

      try {
        const data = (await withTimeout(
          (signal) => tool.handler(parsed.data, { signal }),
          timeoutMs,
        )) as T;
        audit({ ...base, ok: true }, startedAt, requestId);
        return { ok: true, data };
      } catch (error) {
        if (error instanceof Error && error.message === "timeout") {
          audit({ ...base, ok: false, reason: "timeout" }, startedAt, requestId);
          return { ok: false, reason: "timeout" };
        }
        audit({ ...base, ok: false, reason: "handler_error" }, startedAt, requestId);
        throw error;
      }
    },

    async readResource(readOptions: {
      uri: string;
      actor: { role: ActorRole };
      requestId?: string;
    }): Promise<CallResult<string>> {
      const startedAt = Date.now();
      const requestId = readOptions.requestId ?? randomUUID();
      const base = {
        kind: "resource" as const,
        name: readOptions.uri,
        role: readOptions.actor.role,
      };
      const resource = resources.get(readOptions.uri);
      if (!resource) {
        audit({ ...base, ok: false, reason: "not_found" }, startedAt, requestId);
        return { ok: false, reason: "not_found" };
      }

      if (!canCall(readOptions.actor.role, resource.risk)) {
        audit({ ...base, ok: false, reason: "forbidden" }, startedAt, requestId);
        return { ok: false, reason: "forbidden" };
      }

      try {
        const data = await withTimeout(() => resource.read(), timeoutMs);
        audit({ ...base, ok: true }, startedAt, requestId);
        return { ok: true, data };
      } catch (error) {
        if (error instanceof Error && error.message === "timeout") {
          audit({ ...base, ok: false, reason: "timeout" }, startedAt, requestId);
          return { ok: false, reason: "timeout" };
        }
        audit({ ...base, ok: false, reason: "handler_error" }, startedAt, requestId);
        throw error;
      }
    },

    async getPrompt(promptOptions: {
      name: string;
      args: unknown;
      actor: { role: ActorRole };
      requestId?: string;
    }): Promise<CallResult<{ messages: PromptMessage[] }>> {
      const startedAt = Date.now();
      const requestId = promptOptions.requestId ?? randomUUID();
      const base = {
        kind: "prompt" as const,
        name: promptOptions.name,
        role: promptOptions.actor.role,
      };
      const prompt = prompts.get(promptOptions.name);
      if (!prompt) {
        audit({ ...base, ok: false, reason: "not_found" }, startedAt, requestId);
        return { ok: false, reason: "not_found" };
      }

      if (!canCall(promptOptions.actor.role, prompt.risk)) {
        audit({ ...base, ok: false, reason: "forbidden" }, startedAt, requestId);
        return { ok: false, reason: "forbidden" };
      }

      const parsed = prompt.schema.safeParse(promptOptions.args);
      if (!parsed.success) {
        audit({ ...base, ok: false, reason: "invalid_args" }, startedAt, requestId);
        return {
          ok: false,
          reason: "invalid_args",
          error: parsed.error.message,
        };
      }

      try {
        const messages = await withTimeout(() => prompt.render(parsed.data), timeoutMs);
        audit({ ...base, ok: true }, startedAt, requestId);
        return { ok: true, data: { messages } };
      } catch (error) {
        if (error instanceof Error && error.message === "timeout") {
          audit({ ...base, ok: false, reason: "timeout" }, startedAt, requestId);
          return { ok: false, reason: "timeout" };
        }
        audit({ ...base, ok: false, reason: "handler_error" }, startedAt, requestId);
        throw error;
      }
    },
  };
}
