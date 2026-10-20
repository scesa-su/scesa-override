import type { NextRequest } from "next/server";
import { handle, json, readJson, sessionIdFrom, setSessionCookie } from "@/lib/server/http";
import { startSession, toView } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: NextRequest) => {
  const body = (await readJson(req)) as { callsign?: unknown; resumeCode?: unknown } | null;
  const s = await startSession(body?.callsign, body?.resumeCode, sessionIdFrom(req));
  return setSessionCookie(json(await toView(s)), s.id);
});
