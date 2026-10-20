import "server-only";
import { timingSafeEqual } from "node:crypto";
import { getContent } from "./content";

export const PART_COUNT = 6;

const PART_RE = /^\d{3}$/;

/**
 * Parse a verify payload into six 3-digit parts.
 * Accepts `{ parts: string[6] }` or `{ code: "123-456-..." }` / `{ code: "123456..." }`.
 * Returns null when malformed.
 */
export function parseParts(body: unknown): string[] | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { parts?: unknown; code?: unknown };
  let parts: unknown[] | null = null;
  if (Array.isArray(b.parts)) {
    parts = b.parts;
  } else if (typeof b.code === "string") {
    const code = b.code.trim();
    if (/^\d{18}$/.test(code)) parts = code.match(/\d{3}/g) ?? null;
    else parts = code.split("-");
  }
  if (!parts || parts.length !== PART_COUNT) return null;
  const out: string[] = [];
  for (const p of parts) {
    const s = typeof p === "number" ? String(p) : p;
    if (typeof s !== "string" || !PART_RE.test(s)) return null;
    out.push(s);
  }
  return out;
}

/** Constant-time comparison of six validated parts against the answer key from the game content. */
export function checkCode(parts: readonly string[]): boolean {
  const ANSWER = Buffer.from(getContent().codes.join(""), "utf8");
  const candidate = Buffer.from(parts.join(""), "utf8");
  if (candidate.length !== ANSWER.length) {
    // Still burn a compare so timing does not depend on length.
    timingSafeEqual(ANSWER, ANSWER);
    return false;
  }
  return timingSafeEqual(candidate, ANSWER);
}
