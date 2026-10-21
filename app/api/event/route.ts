import { handle, json } from "@/lib/server/http";
import { eventInfo } from "@/lib/server/event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: start/end times and whether entry needs a team code, so the portal can show a countdown. */
export const GET = handle(async () => json({ ...eventInfo(), serverNow: Date.now() }));
