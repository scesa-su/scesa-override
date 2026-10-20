import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CORRECT, WRONG, cookieOf, req } from "./helpers";
import { getStore, resetMemoryStore } from "@/lib/server/store";
import { POST as startPOST } from "@/app/api/session/start/route";
import { GET as sessionGET } from "@/app/api/session/route";
import { POST as hintPOST } from "@/app/api/hint/route";
import { POST as verifyPOST } from "@/app/api/verify/route";
import { POST as claimPOST } from "@/app/api/claim/route";
import { GET as leaderboardGET } from "@/app/api/leaderboard/route";
import { GET as healthGET } from "@/app/api/health/route";

const T0 = new Date("2026-10-24T08:00:00.000Z").getTime();

function at(ms: number) {
  vi.setSystemTime(T0 + ms);
}

async function start(callsign = "Alpha Team", opts: { resumeCode?: unknown; cookie?: string } = {}) {
  const res = await startPOST(
    req("/api/session/start", { body: { callsign, resumeCode: opts.resumeCode }, cookie: opts.cookie }),
  );
  return { res, cookie: res.status === 200 ? cookieOf(res) : "", data: await res.json() };
}

const verify = (cookie: string, parts: unknown = CORRECT) =>
  verifyPOST(req("/api/verify", { body: { parts }, cookie }));
const hint = (cookie: string, artifact: number, index: number) =>
  hintPOST(req("/api/hint", { body: { artifact, index }, cookie }));
const CLAIM = {
  partner1Name: "Jane Wanjiru",
  partner1Adm: "123456",
  partner2Name: "Tom Otieno",
  partner2Adm: "SCT/221-0042",
};
const claim = (cookie: string, body: unknown = CLAIM) =>
  claimPOST(req("/api/claim", { body, cookie }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(0);
  resetMemoryStore();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("session start / resume", () => {
  it("starts a session with an HTTP-only signed cookie", async () => {
    const { res, data } = await start();
    expect(res.status).toBe(200);
    expect(data.startTime).toBe(T0);
    expect(data.penaltySeconds).toBe(0);
    expect(data.hints).toHaveLength(7);
    for (const g of data.hints) expect(g).not.toHaveProperty("owner");
    expect(data.hints.every((g: { revealed: string[] }) => g.revealed.length === 0)).toBe(true);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects empty and over-long call-signs", async () => {
    expect((await start("")).res.status).toBe(400);
    expect((await start("   ")).res.status).toBe(400);
    expect((await start("x".repeat(33))).res.status).toBe(400);
    const bad = await startPOST(req("/api/session/start", { body: "not json" }));
    expect(bad.status).toBe(400);
  });

  it("resumes the same session with the resume code (case-insensitive call-sign)", async () => {
    const a = await start("Alpha Team");
    expect(a.data.resumeCode).toMatch(/^\d{6}$/);
    await hint(a.cookie, 1, 0);
    at(90_000);
    const b = await start("  alpha   TEAM ", { resumeCode: a.data.resumeCode });
    expect(b.res.status).toBe(200);
    expect(b.data.startTime).toBe(T0);
    expect(b.data.penaltySeconds).toBe(90);
    expect(b.data.hints[1].revealed).toHaveLength(1);
    const view = await (await sessionGET(req("/api/session", { cookie: b.cookie }))).json();
    expect(view.startTime).toBe(T0);
  });

  it("returns 401 on every session API without a valid cookie", async () => {
    expect((await sessionGET(req("/api/session"))).status).toBe(401);
    expect((await verify("")).status).toBe(401);
    expect((await hint("", 1, 0)).status).toBe(401);
    expect((await claim("")).status).toBe(401);
    const { cookie } = await start();
    const forged = cookie.slice(0, -3) + "AAA";
    expect((await sessionGET(req("/api/session", { cookie: forged }))).status).toBe(401);
  });
});

describe("call-sign hijack protection", () => {
  it("gives 409 without cookie or code, 409 with a wrong code", async () => {
    const a = await start("Alpha");
    const none = await start("alpha");
    expect(none.res.status).toBe(409);
    expect(none.data).toEqual({ error: "callsign_taken" });
    expect(none.res.headers.get("set-cookie")).toBeNull();
    // A 6-digit string guaranteed to differ from the real code.
    const wrongCode = String((Number(a.data.resumeCode) + 1) % 1_000_000).padStart(6, "0");
    expect(wrongCode).not.toBe(a.data.resumeCode);
    expect((await start("Alpha", { resumeCode: wrongCode })).res.status).toBe(409);
    expect((await start("Alpha", { resumeCode: 123456 })).res.status).toBe(409);
    expect((await start("Alpha", { resumeCode: "" })).res.status).toBe(409);
  });

  it("resumes with the right code or the session's own cookie", async () => {
    const a = await start("Alpha");
    at(5000);
    const byCode = await start("Alpha", { resumeCode: a.data.resumeCode });
    expect(byCode.res.status).toBe(200);
    expect(byCode.data.startTime).toBe(T0);
    const byCookie = await start("ALPHA", { cookie: a.cookie });
    expect(byCookie.res.status).toBe(200);
    expect(byCookie.data.startTime).toBe(T0);
    expect(byCookie.data.resumeCode).toBe(a.data.resumeCode);
  });

  it("locks resume after 5 failures in the window, even for the right code", async () => {
    const a = await start("Alpha");
    const wrongCode = String((Number(a.data.resumeCode) + 1) % 1_000_000).padStart(6, "0");
    for (let i = 0; i < 5; i++) {
      expect((await start("Alpha", { resumeCode: wrongCode })).res.status).toBe(409);
    }
    const locked = await start("Alpha", { resumeCode: a.data.resumeCode });
    expect(locked.res.status).toBe(429);
    expect(locked.data).toEqual({ error: "too_many_attempts" });
    // The owner's cookie still works.
    expect((await start("Alpha", { cookie: a.cookie })).res.status).toBe(200);
  });

  it("caps parallel resume guesses at 5", async () => {
    const a = await start("Alpha");
    const wrongCode = String((Number(a.data.resumeCode) + 1) % 1_000_000).padStart(6, "0");
    const results = await Promise.all(
      Array.from({ length: 20 }, () => start("Alpha", { resumeCode: wrongCode })),
    );
    const statuses = results.map((r) => r.res.status);
    expect(statuses.filter((st) => st === 409)).toHaveLength(5);
    expect(statuses.filter((st) => st === 429)).toHaveLength(15);
  });

  it("lets exactly one of two concurrent starts claim a call-sign", async () => {
    const [x, y] = await Promise.all([
      startPOST(req("/api/session/start", { body: { callsign: "Alpha" } })),
      startPOST(req("/api/session/start", { body: { callsign: "alpha" } })),
    ]);
    const statuses = [x.status, y.status].sort();
    expect(statuses).toEqual([200, 409]);
    const winner = x.status === 200 ? x : y;
    const loser = x.status === 200 ? y : x;
    expect(cookieOf(winner)).toBeTruthy();
    expect(loser.headers.get("set-cookie")).toBeNull();
  });

  it("does not accept another session's cookie as a credential", async () => {
    await start("Alpha");
    const b = await start("Bravo");
    expect((await start("Alpha", { cookie: b.cookie })).res.status).toBe(409);
  });

  it("starts fresh when the call-sign index points at a missing session", async () => {
    const store = getStore();
    await store.set("callsign:ghost", "no-such-session");
    at(1000);
    const g = await start("Ghost");
    expect(g.res.status).toBe(200);
    expect(g.data.startTime).toBe(T0 + 1000);
    // Index now points at the new session, so it is protected again.
    expect((await start("ghost")).res.status).toBe(409);
    expect((await start("ghost", { cookie: g.cookie })).res.status).toBe(200);
  });
});

describe("verify", () => {
  it("returns 401 with a 3 s cooldown on a wrong code", async () => {
    const { cookie } = await start();
    const res = await verify(cookie, WRONG);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, cooldownMs: 3000 });
  });

  it("returns 429 inside the cooldown, even for the correct code", async () => {
    const { cookie } = await start();
    await verify(cookie, WRONG);
    at(1000);
    const spam = await verify(cookie, CORRECT);
    expect(spam.status).toBe(429);
    expect((await spam.json()).retryAfterMs).toBe(2000);
    at(3000);
    const ok = await verify(cookie, CORRECT);
    expect(ok.status).toBe(200);
  });

  it("returns 400 for malformed parts", async () => {
    const { cookie } = await start();
    expect((await verify(cookie, ["64", "456", "789", "246", "135", "864"])).status).toBe(400);
    expect((await verify(cookie, ["a41", "456", "789", "246", "135", "864"])).status).toBe(400);
    expect((await verify(cookie, ["123", "456"])).status).toBe(400);
    // Malformed input does not start a cooldown.
    expect((await verify(cookie, CORRECT)).status).toBe(200);
  });

  it("freezes server-computed times on the first success", async () => {
    const { cookie } = await start();
    await hint(cookie, 0, 0); // free
    await hint(cookie, 6, 0); // 30 s
    at(754_900);
    const res = await verify(cookie, CORRECT);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, rawTime: 754, penaltyTime: 30, totalScoreTime: 784 });
    expect(body.vault.lines[0]).toBe("SENTINEL OVERRIDE SUCCESSFUL // AIR-GAP DECRYPTED");
    expect(body.vault.banner).toBe("COMPLETE THE CLAIM FORM TO RECORD YOUR OFFICIAL RANK.");
    const unclaimed = await (await sessionGET(req("/api/session", { cookie }))).json();
    expect(unclaimed.rank).toBeNull();
    expect(unclaimed.vault.banner).toBe("COMPLETE THE CLAIM FORM TO RECORD YOUR OFFICIAL RANK.");

    at(2_000_000);
    const again = await (await verify(cookie, WRONG)).json();
    expect(again).toMatchObject({ ok: true, rawTime: 754, penaltyTime: 30, totalScoreTime: 784 });
    const view = await (await sessionGET(req("/api/session", { cookie }))).json();
    expect(view.solved.totalScoreTime).toBe(784);
  });

  it("accepts a dashed code string", async () => {
    const { cookie } = await start();
    const res = await verifyPOST(req("/api/verify", { body: { code: "123-456-789-246-135-864" }, cookie }));
    expect(res.status).toBe(200);
  });

  it("never leaks the answer key before solving", async () => {
    const { cookie, data } = await start();
    const wrong = await (await verify(cookie, WRONG)).text();
    const view = await (await sessionGET(req("/api/session", { cookie }))).text();
    for (const text of [JSON.stringify(data), wrong, view]) {
      expect(text).not.toContain("789-246");
      expect(text).not.toContain("CULPRIT FILE");
    }
  });
});

describe("hints", () => {
  it("charges each reveal once and in order", async () => {
    const { cookie } = await start();
    const out = await hint(cookie, 5, 1);
    expect(out.status).toBe(409);

    const h1 = await hint(cookie, 5, 0);
    expect(h1.status).toBe(200);
    const b1 = await h1.json();
    expect(b1.penaltySeconds).toBe(30);
    expect(b1.text).toBe("Echo nudge.");

    const repeat = await (await hint(cookie, 5, 0)).json();
    expect(repeat.text).toBe(b1.text);
    expect(repeat.penaltySeconds).toBe(30);

    expect((await hint(cookie, 5, 1)).status).toBe(200);
    expect((await hint(cookie, 5, 2)).status).toBe(200);
    expect((await hint(cookie, 1, 0)).status).toBe(200);
    const view = await (await sessionGET(req("/api/session", { cookie }))).json();
    expect(view.penaltySeconds).toBe(30 + 60 + 90 + 90);
    expect(view.hints[5].revealed).toHaveLength(3);
    expect(view.hints[2].revealed).toHaveLength(0);
  });

  it("rejects unknown artifacts or indexes", async () => {
    const { cookie } = await start();
    expect((await hint(cookie, 7, 0)).status).toBe(400);
    expect((await hint(cookie, 0, 1)).status).toBe(400);
    expect((await hint(cookie, -1, 0)).status).toBe(400);
    const bad = await hintPOST(req("/api/hint", { body: { artifact: "x", index: 0 }, cookie }));
    expect(bad.status).toBe(400);
  });

  it("rejects non-number artifact/index instead of coercing", async () => {
    const { cookie } = await start();
    for (const [artifact, index] of [
      [null, null],
      ["", ""],
      [true, false],
      ["1", 0],
      [1, "0"],
      [0, null],
      [[1], 0],
      [1.5, 0],
    ]) {
      const res = await hintPOST(req("/api/hint", { body: { artifact, index }, cookie }));
      expect(res.status, JSON.stringify([artifact, index])).toBe(400);
    }
    const view = await (await sessionGET(req("/api/session", { cookie }))).json();
    expect(view.penaltySeconds).toBe(0);
  });

  it("refuses new hints after the session is solved", async () => {
    const { cookie } = await start();
    await hint(cookie, 2, 0);
    await verify(cookie, CORRECT);
    expect((await hint(cookie, 2, 1)).status).toBe(409);
    // Already-revealed text is still readable without extra charge.
    const again = await (await hint(cookie, 2, 0)).json();
    expect(again.penaltySeconds).toBe(60);
  });
});

describe("claim + leaderboard", () => {
  it("forbids claiming before solving", async () => {
    const { cookie } = await start();
    expect((await claim(cookie)).status).toBe(403);
  });

  it("validates fields and returns the existing record on a second claim", async () => {
    const { cookie } = await start();
    at(300_000);
    await verify(cookie, CORRECT);
    expect((await claim(cookie, { ...CLAIM, partner2Adm: "" })).status).toBe(400);
    expect((await claim(cookie, { ...CLAIM, partner1Name: "J" })).status).toBe(400);
    expect((await claim(cookie, { ...CLAIM, partner1Adm: "12 34" })).status).toBe(400);
    const empty = await claim(cookie, {});
    expect(empty.status).toBe(400);
    expect((await empty.json()).fields).toEqual(["partner1Name", "partner1Adm", "partner2Name", "partner2Adm"]);
    const one = await claim(cookie, { ...CLAIM, partner2Adm: "bad adm!" });
    expect((await one.json()).fields).toEqual(["partner2Adm"]);

    const first = await claim(cookie);
    expect(first.status).toBe(200);
    const fb = await first.json();
    expect(fb.rank).toBe(1);
    expect(fb.banner).toBe("DEMO: You finished first! Present this screen to an organiser.");
    expect(fb.claim).toMatchObject({
      teamCallsign: "Alpha Team",
      ...CLAIM,
      rawTime: 300,
      penaltyTime: 0,
      totalScoreTime: 300,
      completedAt: new Date(T0 + 300_000).toISOString(),
    });

    const second = await (await claim(cookie, { ...CLAIM, partner1Name: "Someone Else" })).json();
    expect(second.claim.partner1Name).toBe("Jane Wanjiru");
  });

  it("requires the secret and ranks by adjusted time", async () => {
    const a = await start("Alpha");
    const b = await start("Bravo");
    const c = await start("Charlie");
    await hint(a.cookie, 1, 0); // +90
    at(260_000);
    await verify(a.cookie, CORRECT); // 260 + 90 = 350
    at(300_000);
    await verify(b.cookie, CORRECT); // 300
    await claim(b.cookie);
    const aClaim = await (await claim(a.cookie)).json();
    expect(aClaim.rank).toBe(2);
    expect(aClaim.banner).toBe("DEMO: Present this screen to an organiser — OFFICIAL RANK #2.");

    expect((await leaderboardGET(req("/api/leaderboard"))).status).toBe(401);
    expect((await leaderboardGET(req("/api/leaderboard?secret=nope"))).status).toBe(401);

    const res = await leaderboardGET(req("/api/leaderboard?secret=test-board-secret"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.sessions).toEqual({ started: 3, solved: 2 });
    expect(body.entries.map((e: { teamCallsign: string; rank: number; totalScoreTime: number }) => [e.rank, e.teamCallsign, e.totalScoreTime])).toEqual([
      [1, "Bravo", 300],
      [2, "Alpha", 350],
    ]);
    expect(body.entries[0].sessionId).toBeUndefined();
    void c;

    const second = await (await claim(b.cookie)).json();
    expect(second.banner).toBe("DEMO: You finished first! Present this screen to an organiser.");
    const aView = await (await sessionGET(req("/api/session", { cookie: a.cookie }))).json();
    expect(aView.vault.banner).toBe(
      "DEMO: Present this screen to an organiser — OFFICIAL RANK #2.",
    );

    const view = await (await sessionGET(req("/api/session", { cookie: a.cookie }))).json();
    expect(view.rank).toBe(2);
    expect(view.claim.partner1Name).toBe("Jane Wanjiru");
  });

  it("breaks equal adjusted-time ties by completedAt", async () => {
    const fast = await start("Hinted"); // +30 penalty, finishes first in wall time
    const slow = await start("Clean"); // no penalty, finishes later
    await hint(fast.cookie, 6, 0);
    at(115_000);
    await verify(fast.cookie, CORRECT); // 115 + 30 = 145
    at(145_000);
    await verify(slow.cookie, CORRECT); // 145 + 0 = 145
    // Claim in the opposite order so insertion order cannot decide the rank.
    await claim(slow.cookie);
    await claim(fast.cookie);
    const body = await (await leaderboardGET(req("/api/leaderboard?secret=test-board-secret"))).json();
    expect(
      body.entries.map((e: { rank: number; teamCallsign: string; totalScoreTime: number }) => [
        e.rank,
        e.teamCallsign,
        e.totalScoreTime,
      ]),
    ).toEqual([
      [1, "Hinted", 145],
      [2, "Clean", 145],
    ]);
  });

  it("renders escaped HTML when the browser asks for it", async () => {
    const { cookie } = await start("<script>x</script>");
    await verify(cookie, CORRECT);
    await claim(cookie);
    const res = await leaderboardGET(
      req("/api/leaderboard?secret=test-board-secret", { headers: { accept: "text/html,application/xhtml+xml" } }),
    );
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain('http-equiv="refresh" content="10"');
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).not.toContain("<script>x</script>");
  });
});

describe("health", () => {
  it("reports each check without leaking values", async () => {
    const res = await healthGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.checks).toMatchObject({ sessionSecret: true, leaderboardSecret: true, content: true, store: true });
    const text = JSON.stringify(body);
    expect(text).not.toContain("test-secret");
    expect(text).not.toContain("test-board-secret");
  });
});

describe("timed and escalating hints", () => {
  it("keeps the roadmap encrypted for 10 minutes, then reveals it free", async () => {
    const { cookie } = await start();
    at(599_000);
    const early = await hint(cookie, 0, 0);
    expect(early.status).toBe(409);
    expect((await early.json()).error).toBe("not_yet_available");
    at(600_000);
    const ok = await hint(cookie, 0, 0);
    expect(ok.status).toBe(200);
    expect((await ok.json()).penaltySeconds).toBe(0);
  });

  it("exposes per-hint penalties and the unlock time in the view", async () => {
    const { data } = await start();
    const roadmap = data.hints.find((g: { artifact: number }) => g.artifact === 0);
    expect(roadmap.unlocksAt).toBe(T0 + 600_000);
    const vip = data.hints.find((g: { artifact: number }) => g.artifact === 1);
    expect(vip.penalties).toEqual([90, 210]);
    expect(vip.unlocksAt).toBeNull();
  });

  it("charges each hint its own escalating penalty", async () => {
    const { cookie } = await start();
    await hint(cookie, 1, 0);
    const second = await (await hint(cookie, 1, 1)).json();
    expect(second.penaltySeconds).toBe(90 + 210);
  });
});
