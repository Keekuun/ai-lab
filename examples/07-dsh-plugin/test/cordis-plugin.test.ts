import assert from "node:assert/strict";
import { Context } from "@deepseek-ai/cordis";
import { describe, it } from "vitest";
import { NotesService } from "../src/notes-service.js";
import { createWordCountPlugin, WORD_COUNT_TOOL } from "../src/word-count-plugin.js";

// 自定义事件类型登记（declaration merging，Cordis 官方推荐做法）
declare module "@deepseek-ai/cordis" {
  interface Events {
    ping(payload: string): void;
  }
}

async function settle() {
  // Cordis 插件加载是异步的（PENDING → ACTIVE），让出事件循环等它就绪
  await new Promise((resolve) => setTimeout(resolve, 30));
}

describe("Cordis 服务与依赖注入", () => {
  it("服务插件挂载后可经 ctx 访问", async () => {
    const root = new Context();
    root.plugin(NotesService);
    await settle();

    root.notes.add("第一条");
    assert.deepEqual(root.notes.list(), ["第一条"]);
  });

  it("inject 声明依赖：插件在依赖就绪后才 apply", async () => {
    const root = new Context();
    const order: string[] = [];

    root.plugin({
      inject: ["notes"],
      apply() {
        order.push("consumer");
      },
    });
    await settle();
    assert.deepEqual(order, [], "依赖缺失时应停在 PENDING");

    root.plugin(NotesService);
    await settle();
    assert.deepEqual(order, ["consumer"], "依赖出现后自动加载");
  });

  it("依赖被 dispose 时，消费者自动卸载并清理注册", async () => {
    const root = new Context();
    const notesFiber = root.plugin(NotesService);
    root.plugin(createWordCountPlugin());
    await settle();
    assert.ok(root.notes.listToolNames().includes(WORD_COUNT_TOOL));

    await notesFiber.dispose();
    await settle();
    // 消费者已卸载；重新挂载服务后消费者应复活
    root.plugin(NotesService);
    await settle();
    assert.ok(root.notes.listToolNames().includes(WORD_COUNT_TOOL));
  });
});

describe("word_count 工具插件", () => {
  it("统计笔记总词数", async () => {
    const root = new Context();
    root.plugin(NotesService);
    root.plugin(createWordCountPlugin());
    await settle();

    root.notes.add("hello world");
    root.notes.add("foo");
    assert.equal(root.notes.callTool(WORD_COUNT_TOOL), 3);
  });

  it("插件 dispose 后工具注册被清理", async () => {
    const root = new Context();
    root.plugin(NotesService);
    const fiber = root.plugin(createWordCountPlugin());
    await settle();
    assert.ok(root.notes.listToolNames().includes(WORD_COUNT_TOOL));

    await fiber.dispose();
    await settle();
    assert.ok(!root.notes.listToolNames().includes(WORD_COUNT_TOOL));
  });
});

describe("Cordis 事件", () => {
  it("插件 emit / on 通信，dispose 后监听器移除", async () => {
    const root = new Context();
    const received: string[] = [];

    const listener = root.plugin({
      apply(ctx) {
        ctx.on("ping", (payload: string) => received.push(payload));
      },
    });
    const emitter = root.plugin({
      apply(ctx) {
        ctx.emit("ping", "from-emitter");
      },
    });
    await settle();
    assert.deepEqual(received, ["from-emitter"]);

    await listener.dispose();
    await settle();
    // 重新挂一个新的 emitter（同一插件对象不能挂载两次）
    root.plugin({
      apply(ctx) {
        ctx.emit("ping", "second");
      },
    });
    await settle();
    assert.equal(received.length, 1, "监听器已卸载，不应再收到");
  });
});
