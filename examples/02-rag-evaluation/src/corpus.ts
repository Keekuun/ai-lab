import type { Document, RagCase } from "./types.js";

export const corpus: Document[] = [
  {
    source: "lcel.md",
    text: "## LCEL\n\nLCEL 用 pipe 组合 Runnable，是 LangChain 的编排语法。",
  },
  {
    source: "noise.md",
    text: "## 闲聊\n\npipe pipe pipe pipe pipe pipe pipe pipe pipe pipe pipe pipe",
  },
  {
    source: "weather.md",
    text: "## 天气\n\n今天杭州多云，和编排无关。",
  },
];

export const goldenCases: RagCase[] = [
  {
    id: "lcel",
    question: "LCEL 是什么 pipe",
    relevantSources: ["lcel.md"],
    expectedPoints: ["Runnable"],
  },
  {
    id: "stock",
    question: "NVIDIA 今日股价",
    relevantSources: [],
    expectedPoints: [],
    shouldAbstain: true,
  },
];
