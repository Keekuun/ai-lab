// Ollama 本地模型客户端：generate + embed，全部走 HTTP API。
// 无 SDK 依赖，fetch 可注入便于单测；超时用 AbortSignal.timeout 实现真取消。

export type OllamaErrorKind = "unreachable" | "timeout" | "bad_response";

export class OllamaError extends Error {
  constructor(
    public readonly kind: OllamaErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "OllamaError";
  }
}

export type OllamaClientOptions = {
  host?: string;
  model?: string;
  embedModel?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
};

export type OllamaClient = {
  host: string;
  model: string;
  embedModel: string;
  generate: (
    prompt: string,
    options?: { format?: "json"; think?: boolean; schema?: Record<string, unknown> },
  ) => Promise<string>;
  embed: (text: string) => Promise<number[]>;
  isReachable: () => Promise<boolean>;
};

const DEFAULT_HOST = "http://localhost:11434";
const DEFAULT_MODEL = "gemma4:latest";
const DEFAULT_EMBED_MODEL = "bge-m3";
const DEFAULT_TIMEOUT_MS = 120_000;

export function createOllamaClient(options: OllamaClientOptions = {}): OllamaClient {
  const host = options.host ?? process.env.OLLAMA_HOST ?? DEFAULT_HOST;
  const model = options.model ?? process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;
  const embedModel = options.embedModel ?? process.env.OLLAMA_EMBED_MODEL ?? DEFAULT_EMBED_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchFn = options.fetchFn ?? fetch;

  async function post(path: string, body: Record<string, unknown>): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchFn(`${host}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      // AbortSignal.timeout 在 Node/undici 下抛 TimeoutError，浏览器是 AbortError，都算超时
      const errorName = (error as { name?: string }).name;
      if (errorName === "AbortError" || errorName === "TimeoutError") {
        throw new OllamaError("timeout", `Ollama 请求超过 ${timeoutMs}ms：${path}`);
      }
      throw new OllamaError(
        "unreachable",
        `连不上 Ollama（${host}），先运行 ollama serve：${(error as Error).message}`,
      );
    }
    if (!response.ok) {
      throw new OllamaError(
        "bad_response",
        `Ollama 返回 ${response.status}：${await response.text()}`,
        response.status,
      );
    }
    return response.json();
  }

  return {
    host,
    model,
    embedModel,

    async generate(prompt, generateOptions) {
      const payload = (await post("/api/generate", {
        model,
        prompt,
        stream: false,
        // format 传 schema 对象时 Ollama 做约束解码，保证输出严格符合结构；
        // 只传 "json" 仅保证是合法 JSON，结构随模型心情——小模型经常自由发挥
        ...(generateOptions?.schema
          ? { format: generateOptions.schema }
          : generateOptions?.format
            ? { format: generateOptions.format }
            : {}),
        // think:false 关掉思考模式：gemma4 思考时会在 JSON 里塞冗长 thought 字段，容易截断
        ...(generateOptions?.think !== undefined ? { think: generateOptions.think } : {}),
      })) as { response?: string };
      if (typeof payload.response !== "string") {
        throw new OllamaError("bad_response", "Ollama generate 缺少 response 字段");
      }
      return payload.response;
    },

    // 签名与 retrieve.ts 的 EmbedText 一致，可直接插进 retrieveEmbedded/retrieveHybrid
    async embed(text) {
      const payload = (await post("/api/embed", { model: embedModel, input: text })) as {
        embeddings?: number[][];
      };
      const vector = payload.embeddings?.[0];
      if (!vector || vector.length === 0) {
        throw new OllamaError("bad_response", `Ollama embed 返回空向量（模型 ${embedModel}）`);
      }
      return vector;
    },

    async isReachable() {
      try {
        const response = await fetchFn(`${host}/api/tags`, {
          signal: AbortSignal.timeout(Math.min(timeoutMs, 5_000)),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
  };
}
