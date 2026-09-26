---
title: 01 Cordis 插件系统：服务、inject 与自动清理
sidebar: auto
date: 2026-09-26
isComment: true
categories:
- AI
- Agent
tags:
- DeepSeek
- Cordis
- 插件系统
---

# 01 Cordis 插件系统：服务、inject 与自动清理

> Cordis 是 DeepSeek Harness 的底层插件运行时（论文：[A Programming Paradigm for Spatiotemporal Composability](https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/)），npm 包 `@deepseek-ai/cordis`（本系列基于 4.0.4）。它解决的的问题：**插件之间的依赖、注册清理、热替换，全部由框架托管**。本篇代码均在 [examples/07-dsh-plugin](https://github.com/Keekuun/ai-lab/tree/main/examples/07-dsh-plugin) 有测试覆盖。

---

## 核心模型：插件 = 挂进共享 Context 的函数

```ts
// 一个插件就是一个带 apply 的对象（或函数、或 Service 子类）
const myPlugin = {
  inject: ["notes"],            // 声明依赖：notes 服务就绪前停在 PENDING
  apply(ctx: Context) {
    ctx.notes.registerTool("word_count", () => ...);  // 消费服务
    ctx.on("some-event", handler);                     // 订阅事件
    ctx.effect(() => () => closeDb());                 // 登记自定义清理
  },
};

const root = new Context();
root.plugin(myPlugin);
```

Cordis 托管三件事：

### 1. 依赖驱动加载（inject）

- `inject` 列出的服务全部存在，插件才从 PENDING 进入 ACTIVE
- `cordis.yml` 里的书写顺序无关——**依赖图决定启动顺序**
- 不是一次性检查：服务运行中被卸载 → 所有依赖它的插件级联卸载；服务回归 → 自动重载

这解决了插件系统最脏的问题：「A 依赖 B，B 热更新后 A 还拿着旧引用」。Cordis 里这种情况不可能发生——B 消失的瞬间 A 的注册就被回收了。

### 2. 注册自动回收（effect）

插件经 `ctx` 做的一切注册都被追踪，卸载时逆序清理：

| 注册 | 清理时机 |
| --- | --- |
| `ctx.on(event, handler)` | 插件卸载 → 监听器移除 |
| `ctx.tools.register(tool)` | 插件卸载 → 工具消失 |
| `ctx.llm.registerAdapter(...)` | 插件卸载 → 模型适配器消失 |
| `ctx.effect(() => cleanup)` | 插件卸载 → 执行 cleanup |

07 实验的实测（CLI 第 3 步）：dispose 消费者插件后，它注册的 `word_count` 工具立刻从服务的注册表里消失——**服务本身不用知道工具是谁注册的**。

### 3. 生命周期状态机

每个插件实例是一个 Fiber：`PENDING → ACTIVE → DISPOSED`（失败则 FAILED）。`fiber.dispose()` 保证：注册全清、子插件递归卸载、Promise 在清理完成后 resolve。

## 服务：ctx 上的命名能力

```ts
export class NotesService extends Service {
  // 坑：必须写显式 constructor——TS 字段初始化语法下隐式构造会丢 name 参数
  constructor(ctx: Context) {
    super(ctx, "notes");   // 注册到 ctx.notes，卸载时自动移除
  }
}
```

配套类型安全用 declaration merging（不产生运行时代码）：

```ts
declare module "@deepseek-ai/cordis" {
  interface Context {
    notes: NotesService;
  }
}
```

**4.x 行为注意**：未在 `inject` 里声明依赖的上下文访问 `ctx.notes` 会抛 `cannot get property "notes" without inject`——服务访问是显式契约，不是全局单例随便摸。

## 事件：类型化 + 两种语义

- `ctx.emit` / `ctx.on`：广播，所有监听器都收到
- `ctx.waterfall`：短路语义，任一监听器返回非 undefined 即停（适合「拦截/改写」场景）
- 自定义事件用 `declare module ... interface Events` 登记获得类型检查

## HMR：配置即插件树

`cordis.yml` 描述插件树，配合 `@deepseek-ai/cordis-plugin-hmr`：改源文件 → 旧插件卸载（注册全清）→ 新代码加载 → `apply` 重跑。因为清理是框架保证的，热替换不会残留旧注册——这是「自动回收」机制的直接红利。

## 与其他框架的「依赖注入」对照

| | Cordis | NestJS | VS Code |
| --- | --- | --- | --- |
| 依赖声明 | `inject: ["name"]` | 构造函数装饰器 | contribution point |
| 运行期依赖消失 | 级联卸载+自动重载 | 不支持（启动期校验） | 部分支持 |
| 注册清理 | 框架自动 | 手动 onModuleDestroy | dispose 手动 |

Cordis 的独特处就在**运行期**三个字：为「热替换插件的 agent 运行时」而生。

---

## 小结

- 插件 = 带 `apply` 的对象；`inject` 声明依赖，框架管加载顺序与级联卸载
- 一切经 `ctx` 的注册自动回收——热替换不残留
- 服务访问有 inject 校验（4.x）；Service 子类要写显式 constructor
- 这些机制在 07 实验里全部可测、可复现

下一篇：[02 Harness 全景与落地](./02-harness-overview.md)。
