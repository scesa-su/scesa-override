import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Game content (answer key, hints, victory copy) is never committed.
 * Sources, first match wins:
 *   1. GAME_CONTENT       base64-encoded JSON (production: set in Vercel env)
 *   2. GAME_CONTENT_FILE  path to a JSON file (local dev with the real puzzle)
 *   3. content/game.example.json  public demo puzzle (dev/test only)
 */
export interface HintGroup {
  /** 0 = roadmap, 1-6 = artifacts in code-slot order. */
  artifact: number;
  title: string;
  /** Penalty in seconds charged for each hint in this group. */
  penaltySeconds: number;
  hints: readonly string[];
}

export interface GameContent {
  codes: readonly string[];
  hints: readonly HintGroup[];
  vault: {
    lines: readonly string[];
    /** Certificate banner for rank 1. */
    winnerBanner: string;
    /** Certificate banner for rank > 1; `{rank}` is replaced. */
    rankBanner: string;
  };
}

const g = globalThis as unknown as { __scesaContent?: GameContent };

function fail(msg: string): never {
  throw new Error(`[scesa-override] Invalid game content: ${msg}`);
}

function validate(raw: unknown): GameContent {
  const c = raw as GameContent;
  if (!c || typeof c !== "object") fail("not an object");
  if (!Array.isArray(c.codes) || c.codes.length !== 6 || !c.codes.every((x) => /^\d{3}$/.test(x))) {
    fail("codes must be six 3-digit strings");
  }
  if (!Array.isArray(c.hints) || c.hints.length === 0) fail("hints missing");
  for (const grp of c.hints) {
    if (
      !Number.isInteger(grp.artifact) ||
      typeof grp.title !== "string" ||
      !Number.isFinite(grp.penaltySeconds) ||
      !Array.isArray(grp.hints) ||
      !grp.hints.every((h: unknown) => typeof h === "string")
    ) {
      fail(`hint group ${String(grp?.artifact)} malformed`);
    }
  }
  const v = c.vault;
  if (
    !v ||
    !Array.isArray(v.lines) ||
    typeof v.winnerBanner !== "string" ||
    typeof v.rankBanner !== "string" ||
    !v.rankBanner.includes("{rank}")
  ) {
    fail("vault must have lines, winnerBanner and rankBanner containing {rank}");
  }
  return c;
}

function load(): GameContent {
  const b64 = process.env.GAME_CONTENT;
  if (b64) return validate(JSON.parse(Buffer.from(b64, "base64").toString("utf8")));
  const file = process.env.GAME_CONTENT_FILE;
  if (file) return validate(JSON.parse(readFileSync(path.resolve(file), "utf8")));
  if (process.env.NODE_ENV === "production") {
    throw new Error("[scesa-override] GAME_CONTENT must be set in production");
  }
  const demo = path.join(process.cwd(), "content", "game.example.json");
  return validate(JSON.parse(readFileSync(demo, "utf8")));
}

export function getContent(): GameContent {
  if (!g.__scesaContent) g.__scesaContent = load();
  return g.__scesaContent;
}

/** Test helper: force a reload on next access. */
export function resetContentCache(): void {
  g.__scesaContent = undefined;
}
