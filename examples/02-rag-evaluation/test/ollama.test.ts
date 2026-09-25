import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createOllamaClient, OllamaError } from "../src/ollama.js";

const HOST = "http://localhost:11434";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createOllamaClient", () => {
  it("generate POST /api/generate 并返回 response 字段", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const client = createOllamaClient({
      host: HOST,
      model: "gemma4:latest",
      fetchFn: async (url, init) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return jsonResponse({ response: "RAG 是检索增强生成。" });
      },
    });

    const text = await client.generate("什么是 RAG？");

    assert.equal(text, "RAG 是检索增强生成。");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${HOST}/api/generate`);
    assert.equal(calls[0].body.model, "gemma4:latest");
    assert.equal(calls[0].body.prompt, "什么是 RAG？");
    assert.equal(calls[0].body.stream, false);
  });

  it("generate 指定 format json 时透传给 API", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const client = createOllamaClient({
      fetchFn: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return jsonResponse({ response: "{}" });
      },
    });

    await client.generate("给出 JSON", { format: "json" });

    assert.equal(bodies[0].format, "json");
  });

  it("generate 指定 think false 时关闭思考模式", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const client = createOllamaClient({
      fetchFn: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return jsonResponse({ response: "{}" });
      },
    });

    await client.generate("给出 JSON", { format: "json", think: false });

    assert.equal(bodies[0].think, false);
  });

  it("generate 指定 schema 时 format 传 schema 对象（约束解码）", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const client = createOllamaClient({
      fetchFn: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return jsonResponse({ response: "{}" });
      },
    });
    const schema = {
      type: "object",
      properties: { answer: { type: "string" } },
      required: ["answer"],
    };

    await client.generate("给出 JSON", { schema });

    assert.deepEqual(bodies[0].format, schema);
  });

  it("连接失败抛 OllamaError kind=unreachable", async () => {
    const client = createOllamaClient({
      fetchFn: async () => {
        throw new TypeError("fetch failed");
      },
    });

    const error = await client.generate("hi").catch((caught) => caught);
    assert.ok(error instanceof OllamaError);
    assert.equal(error.kind, "unreachable");
  });

  it("超过 timeoutMs 抛 OllamaError kind=timeout", async () => {
    const client = createOllamaClient({
      timeoutMs: 10,
      fetchFn: (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted", "AbortError")),
          );
        }),
    });

    const error = await client.generate("hi").catch((caught) => caught);
    assert.ok(error instanceof OllamaError);
    assert.equal(error.kind, "timeout");
  });

  it("HTTP 非 200 抛 OllamaError kind=bad_response 并带状态码", async () => {
    const client = createOllamaClient({
      fetchFn: async () => jsonResponse({ error: "model not found" }, 404),
    });

    const error = await client.generate("hi").catch((caught) => caught);
    assert.ok(error instanceof OllamaError);
    assert.equal(error.kind, "bad_response");
    assert.equal(error.status, 404);
  });

  it("embed POST /api/embed 并返回向量（签名兼容 EmbedText）", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const client = createOllamaClient({
      embedModel: "bge-m3",
      fetchFn: async (url, init) => {
        bodies.push({ url: String(url), ...JSON.parse(String(init?.body)) });
        return jsonResponse({ embeddings: [[0.1, 0.2, 0.3]] });
      },
    });

    const vector = await client.embed("检索增强生成");

    assert.deepEqual(vector, [0.1, 0.2, 0.3]);
    assert.equal(bodies[0].url, `${HOST}/api/embed`);
    assert.equal(bodies[0].model, "bge-m3");
    assert.deepEqual(bodies[0].input, "检索增强生成");
  });

  it("isReachable：/tags 通则 true，断则 false", async () => {
    const up = createOllamaClient({ fetchFn: async () => jsonResponse({ models: [] }) });
    const down = createOllamaClient({
      fetchFn: async () => {
        throw new TypeError("fetch failed");
      },
    });

    assert.equal(await up.isReachable(), true);
    assert.equal(await down.isReachable(), false);
  });

  it("默认读取 OLLAMA_HOST / OLLAMA_MODEL 环境变量", async () => {
    process.env.OLLAMA_HOST = "http://example:1234";
    process.env.OLLAMA_MODEL = "env-model";
    try {
      const bodies: Array<Record<string, unknown>> = [];
      const urls: string[] = [];
      const client = createOllamaClient({
        fetchFn: async (url, init) => {
          urls.push(String(url));
          bodies.push(JSON.parse(String(init?.body)));
          return jsonResponse({ response: "ok" });
        },
      });

      await client.generate("hi");

      assert.equal(urls[0], "http://example:1234/api/generate");
      assert.equal(bodies[0].model, "env-model");
    } finally {
      delete process.env.OLLAMA_HOST;
      delete process.env.OLLAMA_MODEL;
    }
  });
});
