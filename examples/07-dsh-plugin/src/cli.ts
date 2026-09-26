#!/usr/bin/env node
import { Context } from "@deepseek-ai/cordis";
import { NotesService } from "./notes-service.js";
import { createWordCountPlugin, WORD_COUNT_TOOL } from "./word-count-plugin.js";

// Cordis 插件机制演示：服务、inject 依赖、effect 自动清理。
// 用法：tsx src/cli.ts

async function settle(ms = 30) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const root = new Context();

console.log("== 1. 挂载服务插件 ==");
const notesFiber = root.plugin(NotesService);
await settle();
console.log("服务已注册:", root.reflect.props.notes ? "是" : "否（需经 inject 访问）");

console.log("\n== 2. 挂载消费者插件（inject: ['notes']）==");
const consumerFiber = root.plugin(createWordCountPlugin());
await settle();

// 通过 inject 插件捕获服务句柄进行操作
let notes: NotesService | undefined;
root.plugin({
  inject: ["notes"],
  apply(ctx) {
    notes = ctx.notes as NotesService;
  },
});
await settle();

notes?.add("hello world");
notes?.add("cordis plugin system");
console.log("笔记:", notes?.list());
console.log("已注册工具:", notes?.listToolNames());
console.log(`调用 ${WORD_COUNT_TOOL}:`, notes?.callTool(WORD_COUNT_TOOL), "词");

console.log("\n== 3. dispose 消费者 → 工具注册被 effect 自动清理 ==");
await consumerFiber.dispose();
await settle();
console.log("工具列表:", notes?.listToolNames());

console.log("\n== 4. dispose 服务 → 消费者随之卸载；重挂服务 → 消费者复活 ==");
root.plugin(createWordCountPlugin());
await settle();
await notesFiber.dispose();
await settle();
console.log("服务已卸载。重新挂载…");
root.plugin(NotesService);
await settle();
let notes2: NotesService | undefined;
root.plugin({ inject: ["notes"], apply(ctx) { notes2 = ctx.notes as NotesService; } });
await settle();
console.log("新服务实例上的工具（消费者已复活并重新注册）:", notes2?.listToolNames());
