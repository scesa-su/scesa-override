import { json } from "@/lib/server/http";
import { getContent } from "@/lib/server/content";
import { getStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deployment self-check for organisers. Reports only whether each piece of
 * configuration is present and working — never values or error details.
 */
export async function GET() {
  const env = process.env;
  const checks = {
    sessionSecret: Boolean(env.SESSION_SECRET),
    leaderboardSecret: Boolean(env.LEADERBOARD_SECRET),
    content: false,
    contentSource: env.GAME_CONTENT ? "GAME_CONTENT" : env.GAME_CONTENT_FILE ? "GAME_CONTENT_FILE" : "demo",
    redisConfigured: Boolean(
      (env.KV_REST_API_URL && env.KV_REST_API_TOKEN) ||
        (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN),
    ),
    // A plain REDIS_URL (TCP) is not usable here; the app needs the Upstash REST pair.
    redisUrlOnly: Boolean(env.REDIS_URL) && !env.KV_REST_API_URL && !env.UPSTASH_REDIS_REST_URL,
    store: false,
  };

  try {
    getContent();
    checks.content = true;
  } catch {
    /* reported as content: false */
  }

  try {
    const store = getStore();
    const stamp = Date.now();
    await store.set("health:ping", stamp);
    checks.store = (await store.get<number>("health:ping")) === stamp;
  } catch {
    /* reported as store: false */
  }

  const ok = checks.sessionSecret && checks.leaderboardSecret && checks.content && checks.store;
  return json({ ok, checks }, ok ? 200 : 503);
}
