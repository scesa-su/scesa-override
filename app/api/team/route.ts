import type { NextRequest } from "next/server";
import { handle, json, readJson } from "@/lib/server/http";
import { checkTeam } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: confirm a team name + access code and list its members (works before the start). */
export const POST = handle(async (req: NextRequest) => {
  const body = (await readJson(req)) as { callsign?: unknown; code?: unknown } | null;
  return json(await checkTeam(body?.callsign, body?.code));
});
