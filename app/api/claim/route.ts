import type { NextRequest } from "next/server";
import { handle, json, noSession, readJson, sessionIdFrom } from "@/lib/server/http";
import { bannerForRank } from "@/lib/server/hints";
import { loadSession, submitClaim } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: NextRequest) => {
  const id = sessionIdFrom(req);
  if (!id || !(await loadSession(id))) return noSession();
  const { claim, rank } = await submitClaim(id, await readJson(req));
  return json({ claim, rank, banner: bannerForRank(rank) });
});
