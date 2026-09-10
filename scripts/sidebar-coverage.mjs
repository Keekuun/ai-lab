import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const DOCS_PREFIX = "docs/";

export function markdownPathToRoute(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  assert(normalized.startsWith(DOCS_PREFIX), `不是 docs 下的文件：${filePath}`);
  assert(normalized.endsWith(".md"), `不是 Markdown：${filePath}`);

  const withoutPrefix = normalized.slice(DOCS_PREFIX.length, -".md".length);
  if (withoutPrefix === "index") {
    return "/";
  }
  if (withoutPrefix.endsWith("/index")) {
    return `/${withoutPrefix.slice(0, -"index".length)}`;
  }
  return `/${withoutPrefix}`;
}

export function extractSidebarLinks(configText) {
  const links = new Set();
  const pattern = /link:\s*'(\/[^']*)'/g;
  for (const match of configText.matchAll(pattern)) {
    links.add(match[1]);
  }
  return links;
}

function normalizeRoute(route) {
  if (route === "/") {
    return "/";
  }
  return route.endsWith("/") ? route.slice(0, -1) : route;
}

export function findUnlistedPages(routes, sidebarLinks, allowlist = new Set()) {
  const listed = new Set([...sidebarLinks].map(normalizeRoute));
  const allowed = new Set([...allowlist].map(normalizeRoute));
  return routes.filter((route) => {
    const key = normalizeRoute(route);
    return !listed.has(key) && !allowed.has(key);
  });
}

export function collectMarkdownRoutes(docsRoot) {
  const routes = [];

  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.name.endsWith(".md")) {
        routes.push(markdownPathToRoute(`${DOCS_PREFIX}${relative(docsRoot, fullPath)}`));
      }
    }
  }

  walk(docsRoot);
  return routes.sort();
}

export function checkSidebarCoverage(options) {
  const configText = readFileSync(options.configPath, "utf8");
  const routes = collectMarkdownRoutes(options.docsRoot);
  const sidebarLinks = extractSidebarLinks(configText);
  return findUnlistedPages(routes, sidebarLinks, options.allowlist ?? new Set());
}
