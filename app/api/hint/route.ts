import type { NextRequest } from "next/server";
import { handle, json, noSession, readJson, sessionIdFrom } from "@/lib/server/http";
import { loadSession, revealHint, toView } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: NextRequest) => {
  const id = sessionIdFrom(req);
  if (!id || !(await loadSession(id))) return noSession();
  const body = (await readJson(req)) as { artifact?: unknown; index?: unknown } | null;
  const { text, session } = await revealHint(id, body?.artifact, body?.index);
  const view = await toView(session);
  return json({ text, penaltySeconds: view.penaltySeconds, hints: view.hints });
});
