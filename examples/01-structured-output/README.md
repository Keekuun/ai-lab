# 01 Structured Output

对应 [09 Tools](../../docs/09-tools-system-design.md)、[28 LLM 工程基础](../../docs/28-llm-engineering-foundations.md)、[LC10 Output Parsers](../../docs/langchain/10-output-parsers.md)。

验收：模型吐出非法 JSON 或缺字段时，程序拒绝脏数据并带上校验错误重试；用尽次数则失败，不把半成品交给业务。

## 前置条件

- Node.js 22+
- 在仓库根目录执行过 `pnpm install`

调用真实模型时再复制 `.env.example` 为 `.env` 并填写 `OPENAI_API_KEY`。

## 启动

```bash
pnpm --filter @ai-lab/01-structured-output test
pnpm --filter @ai-lab/01-structured-output start
pnpm --filter @ai-lab/01-structured-output start -- --text="搜索按钮点了没反应，两天内修"
```

## 输入 / 输出

默认演示第一次返回：

```json
{ "title": "登录超时", "priority": "urgent", "tags": [] }
```

`urgent` 不在枚举里，`tags` 为空，也没有 `dueInDays`。第二次才给出合法工单：

```json
{
  "ok": true,
  "data": {
    "title": "修复登录超时",
    "priority": "high",
    "tags": ["auth", "bug"],
    "dueInDays": 2
  },
  "attempts": 2
}
```

## 模型配置

| 变量 | 说明 |
|------|------|
| `OPENAI_API_KEY` | 有值才打真实 API；没有则走本地脚本化演示 |
| `OPENAI_MODEL` | 默认 `gpt-4o-mini` |
| `OPENAI_BASE_URL` | 默认 `https://api.openai.com/v1`，可换成兼容网关 |

## 已知限制

- 这是解析与重试实验，不是完整 Tool 系统或 Agent。
- 演示脚本固定「先脏后净」，用来证明恢复路径，不代表真实模型行为。
- 没有做流式解析；结构化 JSON 必须等完整文本再 `JSON.parse`。

## Token / 延迟 / 成本

本地演示：0 Token。  
真实 API：每次尝试打一行 `[cost] model=... latencyMs=... inputTokens=... outputTokens=...`。请自己记到学习笔记里，不要把 Key 或完整 Prompt 提交进仓库。
