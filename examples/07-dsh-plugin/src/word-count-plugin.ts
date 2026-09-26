import type { Context } from "@deepseek-ai/cordis";

// 消费者插件：向 notes 服务注册一个 word_count 工具。
// inject: ["notes"] 声明依赖——notes 服务不存在时插件停在 PENDING，
// 服务出现自动加载，服务消失自动卸载（注册的工具随之被 effect 清理）。

export const WORD_COUNT_TOOL = "word_count";

export function createWordCountPlugin() {
  return {
    name: "word-count",
    inject: ["notes"],
    apply(ctx: Context) {
      ctx.notes.registerTool(WORD_COUNT_TOOL, () =>
        ctx.notes.list().reduce((total, note) => total + note.split(/\s+/).filter(Boolean).length, 0),
      );
    },
  };
}
