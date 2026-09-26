# 07-dsh-plugin：Cordis 插件机制最小实验

DeepSeek Harness 的底层插件系统 [Cordis](https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/) 的最小可运行样本：服务、依赖注入、effect 自动清理、事件。

对应文档：[docs/deepseek-harness 系列](../../docs/deepseek-harness/index.md)

## 运行

```bash
pnpm --filter @ai-lab/07-dsh-plugin test    # 6 个测试
pnpm --filter @ai-lab/07-dsh-plugin start   # CLI 演示四个机制
```

## 结构

| 文件 | 职责 |
| --- | --- |
| `src/notes-service.ts` | `NotesService extends Service`：笔记存储 + 工具注册表（`registerTool` 内用 `ctx.effect` 登记清理） |
| `src/word-count-plugin.ts` | 消费者插件：`inject: ["notes"]`，向服务注册 `word_count` 工具 |
| `src/cli.ts` | 演示：挂载 → inject 消费 → dispose 清理 → 服务替换后消费者复活 |
| `test/cordis-plugin.test.ts` | 服务挂载、PENDING→依赖就绪自动加载、dispose 级联、事件监听清理 |

## 验收重点

- `inject` 不是一次性检查：依赖消失 → 消费者自动卸载；依赖回归 → 自动重载
- `ctx.effect(() => cleanup)`：插件的一切注册（工具/监听器/资源）随卸载自动回收
- 服务访问有 inject 校验：未声明依赖的上下文取 `ctx.notes` 会抛错（4.x 行为）
- 坑：Service 子类必须写显式 `constructor(ctx) { super(ctx, "name") }`——TS 字段初始化语法下隐式构造会丢 name 参数
