import { startHttpMcpServer } from "./http-server.js";

const DEFAULT_PORT = 3333;
const actorRole = process.env.MCP_ACTOR_ROLE === "reader" ? "reader" : "writer";
const port = Number(process.env.PORT ?? DEFAULT_PORT);
const readerToken = process.env.MCP_HTTP_READER_TOKEN;
const writerToken = process.env.MCP_HTTP_WRITER_TOKEN;

if ((readerToken && !writerToken) || (!readerToken && writerToken)) {
  throw new Error("MCP_HTTP_READER_TOKEN 和 MCP_HTTP_WRITER_TOKEN 必须成对设置");
}

const tokens =
  readerToken && writerToken
    ? { reader: readerToken, writer: writerToken }
    : undefined;

const started = await startHttpMcpServer({
  role: tokens ? undefined : actorRole,
  tokens,
  host: "127.0.0.1",
  port,
});

console.error(
  tokens
    ? `MCP HTTP token-auth ${started.url.href}`
    : `MCP HTTP ${actorRole} ${started.url.href}`,
);

const shutdown = async () => {
  await started.close();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
