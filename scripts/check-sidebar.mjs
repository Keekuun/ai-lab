import { resolve } from "node:path";
import { checkSidebarCoverage } from "./sidebar-coverage.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const missing = checkSidebarCoverage({
  docsRoot: resolve(repoRoot, "docs"),
  configPath: resolve(repoRoot, "docs/.vitepress/config.ts"),
});

if (missing.length > 0) {
  console.error("以下文档没有出现在 VitePress sidebar 里：");
  for (const route of missing) {
    console.error(`- ${route}`);
  }
  process.exitCode = 1;
} else {
  console.log("sidebar 已覆盖全部 docs/*.md");
}
