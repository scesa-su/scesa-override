import { NextResponse, type NextRequest } from "next/server";
import { handle, json } from "@/lib/server/http";
import { getLeaderboard, leaderboardSecretMatches } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esc(v: unknown): string {
  return String(v).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function renderHtml(data: Awaited<ReturnType<typeof getLeaderboard>>): string {
  const rows = data.entries
    .map(
      (e) => `<tr>
<td>#${e.rank}</td><td>${esc(e.teamCallsign)}</td>
<td>${esc(e.partner1Name)}<br><small>${esc(e.partner1Adm)}</small></td>
<td>${e.partner2Name ? `${esc(e.partner2Name)}<br><small>${esc(e.partner2Adm)}</small>` : "<small>SOLO</small>"}</td>
<td>${fmt(e.rawTime)}</td><td>+${fmt(e.penaltyTime)}</td><td><b>${fmt(e.totalScoreTime)}</b></td>
<td>${esc(new Date(e.completedAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" }))}</td>
<td>${e.closeFinish.length ? `<span class="flag">⚑ ${esc(e.closeFinish.join(", "))}</span>` : ""}</td>
</tr>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="10">
<title>Sentinel Leaderboard</title>
<style>
body{background:#050805;color:#22c55e;font-family:"Courier New",monospace;margin:0;padding:16px}
h1{color:#4ade80;text-shadow:0 0 6px #4ade80;font-size:1.3rem;margin:0 0 8px}
p{margin:0 0 16px;opacity:.8}
.wrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:640px}
th,td{border:1px solid #14532d;padding:6px 8px;text-align:left;vertical-align:top}
th{color:#4ade80;background:#0a120a}
tr:first-child td{color:#4ade80}
small{opacity:.7}
.flag{color:#facc15}
</style></head><body>
<h1>SENTINEL OVERRIDE // OFFICIAL LEADERBOARD</h1>
<p>SESSIONS STARTED: ${data.sessions.started} · SOLVED: ${data.sessions.solved} · CLAIMS: ${data.entries.length} · AUTO-REFRESH 10s</p>
<div class="wrap"><table>
<thead><tr><th>RANK</th><th>CALL-SIGN</th><th>PARTNER 1</th><th>PARTNER 2</th><th>RAW</th><th>PENALTY</th><th>ADJUSTED</th><th>COMPLETED</th><th>FINISHED WITHIN 3 MIN OF</th></tr></thead>
<tbody>${rows || '<tr><td colspan="9">NO CLAIMS YET</td></tr>'}</tbody>
</table></div></body></html>`;
}

export const GET = handle(async (req: NextRequest) => {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!leaderboardSecretMatches(secret)) return json({ error: "unauthorized" }, 401);
  const data = await getLeaderboard();
  if ((req.headers.get("accept") ?? "").includes("text/html")) {
    return new NextResponse(renderHtml(data), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return json(data);
});
