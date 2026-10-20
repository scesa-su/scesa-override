import type { NextRequest } from "next/server";
import { handle, json, noSession, sessionIdFrom } from "@/lib/server/http";
import { loadSession, toView } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req: NextRequest) => {
  const s = await loadSession(sessionIdFrom(req));
  if (!s) return noSession();
  return json(await toView(s));
});
