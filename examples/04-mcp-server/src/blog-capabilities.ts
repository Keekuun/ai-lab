import { z } from "zod";
import { createCapabilityServer } from "./server.js";

export function createBlogCapabilities() {
  const server = createCapabilityServer();

  server.register({
    name: "search_blog",
    description: "按关键词检索博客",
    risk: "read",
    schema: z.object({ query: z.string().min(1) }),
    handler: async (args) => ({ hits: [args.query] }),
  });

  server.register({
    name: "publish_post",
    description: "发布一篇博客",
    risk: "write",
    schema: z.object({ title: z.string().min(1) }),
    handler: async (args) => ({ id: "post-1", title: args.title }),
  });

  server.registerResource({
    uri: "blog://posts/welcome",
    name: "welcome",
    description: "欢迎帖",
    mimeType: "text/plain",
    risk: "read",
    read: async () => "hello MCP resource",
  });

  return server;
}
