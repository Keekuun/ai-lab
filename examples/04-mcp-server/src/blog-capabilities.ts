import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { createCapabilityServer, type CapabilityServerOptions } from "./server.js";

type BlogPost = {
  id: string;
  title: string;
  idempotencyKey: string;
};

export type BlogCapabilitiesOptions = CapabilityServerOptions & {
  storePath?: string;
};

function loadPosts(storePath: string | undefined): BlogPost[] {
  if (!storePath || !existsSync(storePath)) {
    return [];
  }
  const parsed: unknown = JSON.parse(readFileSync(storePath, "utf8"));
  assert(Array.isArray(parsed), `${storePath} 必须是 JSON 数组`);
  return parsed as BlogPost[];
}

function savePosts(storePath: string | undefined, posts: BlogPost[]): void {
  if (!storePath) {
    return;
  }
  writeFileSync(storePath, JSON.stringify(posts, null, 2));
}

export function createBlogCapabilities(options?: BlogCapabilitiesOptions) {
  const server = createCapabilityServer(options);
  const posts = loadPosts(options?.storePath);
  const storePath = options?.storePath;

  server.register({
    name: "search_blog",
    description: "按关键词检索已发布的博客标题",
    risk: "read",
    schema: z.object({ query: z.string().min(1) }),
    handler: async (args) => ({
      hits: posts
        .filter((post) => post.title.includes(args.query))
        .map((post) => post.title),
    }),
  });

  server.register({
    name: "publish_post",
    description: "发布一篇博客；同一 idempotencyKey 重复调用返回已有帖子",
    risk: "write",
    schema: z.object({
      title: z.string().min(1),
      idempotencyKey: z.string().min(1),
    }),
    handler: async (args) => {
      const existing = posts.find(
        (post) => post.idempotencyKey === args.idempotencyKey,
      );
      if (existing) {
        return { id: existing.id, title: existing.title, deduplicated: true };
      }
      const post: BlogPost = {
        id: `post-${posts.length + 1}`,
        title: args.title,
        idempotencyKey: args.idempotencyKey,
      };
      posts.push(post);
      savePosts(storePath, posts);
      return { id: post.id, title: post.title, deduplicated: false };
    },
  });

  server.registerResource({
    uri: "blog://posts/welcome",
    name: "welcome",
    description: "欢迎帖",
    mimeType: "text/plain",
    risk: "read",
    read: async () => "hello MCP resource",
  });

  server.registerPrompt({
    name: "summarize_post",
    description: "总结一篇博客",
    risk: "read",
    schema: z.object({ topic: z.string().min(1) }),
    render: async (args) => [{ role: "user", content: `总结：${args.topic}` }],
  });

  return server;
}
