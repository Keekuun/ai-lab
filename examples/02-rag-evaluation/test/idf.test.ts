import { describe, expect, it } from "vitest";
import { chunkByHeading } from "../src/chunk.js";
import { idfMap, retrieveLexical } from "../src/retrieve.js";
import type { Document } from "../src/types.js";

const docs: Document[] = [
  { source: "a.md", text: "## 如何部署\n\n如何部署服务。" },
  { source: "b.md", text: "## 如何配置\n\n如何配置环境，如何配置参数。" },
  { source: "c.md", text: "## Kubernetes\n\nKubernetes 集群的部署方式。" },
];

describe("idfMap", () => {
  it("罕见词 IDF 高于泛词", () => {
    const chunks = chunkByHeading(docs);
    const idf = idfMap(chunks);

    expect(idf.get("kubernetes")!).toBeGreaterThan(idf.get("如何")!);
    expect(idf.get("集群")!).toBeGreaterThan(idf.get("部署")!);
  });

  it("每个 chunk 都出现的词 IDF 接近 0", () => {
    const chunks = chunkByHeading([
      { source: "x.md", text: "共同 词甲" },
      { source: "y.md", text: "共同 词乙" },
    ]);
    const idf = idfMap(chunks);

    // BM25 +1 变体保证非负，全出现词只剩小权重
    expect(idf.get("共同")!).toBeLessThan(0.2);
    expect(idf.get("共同")!).toBeLessThan(idf.get("词甲")!);
  });
});

describe("IDF 加权检索", () => {
  it("含罕见词命中的 chunk 排在泛词命中前面", () => {
    const chunks = chunkByHeading(docs);
    // 「部署」是泛词（df=2），「Kubernetes」只出现在 c.md（df=1，IDF 高）
    const retrieved = retrieveLexical(chunks, "Kubernetes 部署", 3);

    expect(retrieved[0]?.source).toBe("c.md");
  });
});
