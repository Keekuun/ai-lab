import { describe, expect, it } from "vitest";
import { extractStructured } from "../src/extract.js";
import { ticketSchema, type Ticket } from "../src/ticket-schema.js";

const validTicket: Ticket = {
  title: "修复登录超时",
  priority: "high",
  tags: ["auth", "bug"],
  dueInDays: 2,
};

function scriptedGenerate(replies: string[]) {
  const prompts: string[] = [];
  let index = 0;

  const generate = async (prompt: string) => {
    prompts.push(prompt);
    const reply = replies[index];
    index += 1;
    if (reply === undefined) {
      throw new Error(`generate 被多调用了一次，已有 ${replies.length} 条预设回复`);
    }
    return reply;
  };

  return { generate, prompts };
}

describe("extractStructured", () => {
  it("第一次就返回合法 JSON 时，直接交给业务，只调用一次模型", async () => {
    const { generate } = scriptedGenerate([JSON.stringify(validTicket)]);

    const result = await extractStructured({
      generate,
      schema: ticketSchema,
      sourceText: "登录会在两分钟后掉线，优先修。",
    });

    expect(result).toEqual({
      ok: true,
      data: validTicket,
      attempts: 1,
    });
  });

  it("模型先吐出非法 JSON，再用合法 JSON 重试后恢复", async () => {
    const { generate } = scriptedGenerate([
      "这不是 JSON",
      JSON.stringify(validTicket),
    ]);

    const result = await extractStructured({
      generate,
      schema: ticketSchema,
      sourceText: "登录超时",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(validTicket);
      expect(result.attempts).toBe(2);
    }
  });

  it("缺字段或枚举非法时拒绝脏数据，并把校验错误交给下一次重试", async () => {
    const { generate, prompts } = scriptedGenerate([
      JSON.stringify({ title: "登录超时", priority: "urgent", tags: [] }),
      JSON.stringify(validTicket),
    ]);

    const result = await extractStructured({
      generate,
      schema: ticketSchema,
      sourceText: "登录超时",
    });

    expect(result.ok).toBe(true);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toMatch(/priority|tags|urgent/i);
    if (result.ok) {
      expect(result.data.priority).toBe("high");
      expect(result.data.tags).toEqual(["auth", "bug"]);
    }
  });

  it("用完重试次数仍非法时，返回失败且不含 data", async () => {
    const { generate } = scriptedGenerate(["oops", "{", "still broken"]);

    const result = await extractStructured({
      generate,
      schema: ticketSchema,
      sourceText: "登录超时",
      maxAttempts: 3,
    });

    expect(result).toMatchObject({
      ok: false,
      attempts: 3,
    });
    expect(result).not.toHaveProperty("data");
    if (!result.ok) {
      expect(result.lastRaw).toBe("still broken");
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("能从 markdown 代码块里取出 JSON", async () => {
    const { generate } = scriptedGenerate([
      `好的，结果如下：\n\`\`\`json\n${JSON.stringify(validTicket)}\n\`\`\``,
    ]);

    const result = await extractStructured({
      generate,
      schema: ticketSchema,
      sourceText: "登录超时",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(validTicket);
    }
  });
});
