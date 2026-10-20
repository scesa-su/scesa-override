import { NextRequest, type NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/server/session";

for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
  delete process.env[k];
}
process.env.SESSION_SECRET = "test-secret";
process.env.LEADERBOARD_SECRET = "test-board-secret";
// Tests run against the public demo puzzle in content/game.example.json.
delete process.env.GAME_CONTENT;
delete process.env.GAME_CONTENT_FILE;

export function req(
  path: string,
  opts: { method?: string; body?: unknown; cookie?: string | null; headers?: Record<string, string> } = {},
): NextRequest {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.cookie) headers.cookie = `${COOKIE_NAME}=${opts.cookie}`;
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body === undefined ? undefined : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body),
  });
}

export function cookieOf(res: NextResponse): string {
  const c = res.cookies.get(COOKIE_NAME)?.value;
  if (!c) throw new Error("no session cookie on response");
  return c;
}

export const CORRECT = ["123", "456", "789", "246", "135", "864"];
export const WRONG = ["111", "222", "333", "444", "555", "666"];
