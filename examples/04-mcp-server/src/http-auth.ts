import { timingSafeEqual } from "node:crypto";
import type { ActorRole } from "./server.js";

const BEARER_PREFIX = "Bearer ";

export type HttpAuthTokens = {
  reader: string;
  writer: string;
};

function secretsEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function resolveBearerRole(
  authorization: string | undefined,
  tokens: HttpAuthTokens,
): ActorRole | null {
  if (!authorization?.startsWith(BEARER_PREFIX)) {
    return null;
  }
  const token = authorization.slice(BEARER_PREFIX.length);
  if (secretsEqual(token, tokens.writer)) {
    return "writer";
  }
  if (secretsEqual(token, tokens.reader)) {
    return "reader";
  }
  return null;
}
