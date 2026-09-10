import assert from "node:assert/strict";
import type { Chunk, Document } from "./types.js";

function toChunks(document: Document, pieces: string[]): Chunk[] {
  return pieces
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .map((text, index) => ({
      chunkId: `${document.source}#${index}`,
      source: document.source,
      text,
    }));
}

export function chunkByHeading(documents: Document[]): Chunk[] {
  return documents.flatMap((document) => {
    const sections = document.text.split(/^## /m).filter((section) => section.trim().length > 0);
    const pieces = sections.map((section) =>
      document.text.startsWith("## ") || section !== sections[0] ? `## ${section}` : section,
    );
    return toChunks(document, pieces);
  });
}

export function chunkByFixedSize(documents: Document[], size: number): Chunk[] {
  assert(size >= 1, "size 必须 >= 1");
  return documents.flatMap((document) => {
    const pieces: string[] = [];
    for (let index = 0; index < document.text.length; index += size) {
      pieces.push(document.text.slice(index, index + size));
    }
    return toChunks(document, pieces);
  });
}
