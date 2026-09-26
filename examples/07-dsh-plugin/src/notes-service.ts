import { Service, type Context } from "@deepseek-ai/cordis";

// 模拟 harness 里 ctx.tools 这类服务：一个「笔记存储 + 工具注册表」。
// 要点：
// 1. Service 子类本身就是插件，ctx.plugin(NotesService) 即挂载；
//    super(ctx, "notes") 把实例注册到 ctx.notes，卸载时自动移除。
// 2. registerTool 内部用 ctx.effect 登记清理——工具随「注册它的插件」卸载而消失，
//    而不是随本服务消失。这正是 Cordis「注册自动回收」的核心机制。

declare module "@deepseek-ai/cordis" {
  interface Context {
    notes: NotesService;
  }
}

export type NoteTool = () => number;

export class NotesService extends Service {
  private notes: string[] = [];
  private tools = new Map<string, NoteTool>();

  // 显式 constructor：TS 字段初始化语法会让隐式构造的参数传递出问题（实测 name 丢失）
  constructor(ctx: Context) {
    super(ctx, "notes");
  }

  add(content: string): void {
    this.notes.push(content);
  }

  list(): string[] {
    return [...this.notes];
  }

  registerTool(name: string, tool: NoteTool): void {
    this.tools.set(name, tool);
    // effect 的清理函数挂在「当前生效的插件 fiber」上（即调用 registerTool 的插件）
    this.ctx.effect(() => () => this.tools.delete(name));
  }

  callTool(name: string): number {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`工具不存在: ${name}`);
    return tool();
  }

  listToolNames(): string[] {
    return [...this.tools.keys()];
  }
}
