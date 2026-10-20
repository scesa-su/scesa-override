import type { NextRequest } from "next/server";
import { parseParts } from "@/lib/server/codes";
import { NEUTRAL_BANNER, vaultLines } from "@/lib/server/hints";
import { handle, json, noSession, readJson, sessionIdFrom } from "@/lib/server/http";
import { COOLDOWN_MS, loadSession, verifyCode } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: NextRequest) => {
  const id = sessionIdFrom(req);
  if (!id || !(await loadSession(id))) return noSession();
  const parts = parseParts(await readJson(req));
  const r = await verifyCode(id, parts);
  if (r.kind === "cooldown") {
    return json({ ok: false, retryAfterMs: r.retryAfterMs }, 429, {
      "Retry-After": String(Math.ceil(r.retryAfterMs / 1000)),
    });
  }
  if (r.kind === "wrong") return json({ ok: false, cooldownMs: COOLDOWN_MS }, 401);
  const t = r.session.solved!;
  return json({
    ok: true,
    rawTime: t.rawTime,
    penaltyTime: t.penaltyTime,
    totalScoreTime: t.totalScoreTime,
    completedAt: t.completedAt,
    vault: { lines: vaultLines(), banner: NEUTRAL_BANNER },
  });
});
