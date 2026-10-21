import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CORRECT, WRONG, cookieOf, req } from "./helpers";
import { resetMemoryStore } from "@/lib/server/store";
import { resetRosterCache } from "@/lib/server/event";
import { POST as startPOST } from "@/app/api/session/start/route";
import { GET as sessionGET } from "@/app/api/session/route";
import { POST as hintPOST } from "@/app/api/hint/route";
import { POST as verifyPOST } from "@/app/api/verify/route";
import { POST as claimPOST } from "@/app/api/claim/route";
import { GET as leaderboardGET } from "@/app/api/leaderboard/route";
import { GET as eventGET } from "@/app/api/event/route";
import { getGroup, groupId } from "@/lib/server/hints";

const T0 = new Date("2026-10-24T08:00:00.000Z").getTime();
const MIN = 60_000;

function at(ms: number) {
  vi.setSystemTime(T0 + ms);
}

async function start(callsign: string, opts: { resumeCode?: unknown; cookie?: string } = {}) {
  const res = await startPOST(
    req("/api/session/start", { body: { callsign, resumeCode: opts.resumeCode }, cookie: opts.cookie }),
  );
  return { res, cookie: res.status === 200 ? cookieOf(res) : "", data: await res.json() };
}

const verify = (cookie: string, parts: unknown = CORRECT) =>
  verifyPOST(req("/api/verify", { body: { parts }, cookie }));
const hint = (cookie: string, artifact: number, index: number) =>
  hintPOST(req("/api/hint", { body: { group: groupId(getGroup(artifact)!), index }, cookie }));
const claim = (cookie: string) =>
  claimPOST(
    req("/api/claim", {
      body: { partner1Name: "Jane Wanjiru", partner1Adm: "123456", partner2Name: "Tom Otieno", partner2Adm: "654321" },
      cookie,
    }),
  );

const ENV = ["EVENT_START", "EVENT_END", "TEAMS", "TEAMS_FILE", "CASE_FILE_URL"];
const ROSTER = [
  { callsign: "Byte Me", code: "111111" },
  { callsign: "Null Pointers", code: "222222" },
];
const useRoster = () => {
  process.env.TEAMS = Buffer.from(JSON.stringify(ROSTER)).toString("base64");
  resetRosterCache();
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(0);
  resetMemoryStore();
  for (const k of ENV) delete process.env[k];
  resetRosterCache();
});
afterEach(() => {
  vi.useRealTimers();
  for (const k of ENV) delete process.env[k];
  resetRosterCache();
});

describe("shared start (EVENT_START / EVENT_END)", () => {
  beforeEach(() => {
    process.env.EVENT_START = new Date(T0).toISOString();
    process.env.EVENT_END = new Date(T0 + 120 * MIN).toISOString();
  });

  it("refuses to start before the shared start", async () => {
    at(-5000);
    const r = await start("Early Birds");
    expect(r.res.status).toBe(403);
    expect(r.data).toEqual({ error: "not_started", startsAt: T0 });
  });

  it("counts a late team's clock from the shared start", async () => {
    at(20 * MIN);
    const r = await start("Late Team");
    expect(r.res.status).toBe(200);
    expect(r.data.startTime).toBe(T0);
    at(30 * MIN);
    const res = await verify(r.cookie);
    expect((await res.json()).rawTime).toBe(30 * 60);
  });

  it("unlocks the roadmap 10 minutes after the shared start, not after joining", async () => {
    at(12 * MIN);
    const { cookie } = await start("Late Team");
    expect((await hint(cookie, 0, 0)).status).toBe(200);
  });

  it("closes codes, hints and new starts at the end, but still lets teams view", async () => {
    const { cookie } = await start("Alpha");
    at(120 * MIN);
    const v = await verify(cookie);
    expect(v.status).toBe(403);
    expect(await v.json()).toEqual({ error: "event_over" });
    expect((await hint(cookie, 1, 0)).status).toBe(403);
    expect((await start("Too Late")).res.status).toBe(403);
    expect((await start("Alpha", { cookie })).res.status).toBe(200);
    expect((await sessionGET(req("/api/session", { cookie }))).status).toBe(200);
  });

  it("publishes the schedule on /api/event", async () => {
    const body = await (await eventGET()).json();
    expect(body).toEqual({ startsAt: T0, endsAt: T0 + 120 * MIN, teamCodes: false, serverNow: T0 });
  });
});

describe("team roster (TEAMS)", () => {
  beforeEach(useRoster);

  it("rejects call-signs that are not registered", async () => {
    const r = await start("Throwaway");
    expect(r.res.status).toBe(403);
    expect(r.data).toEqual({ error: "not_registered" });
  });

  it("needs the team code to start, and rejects a wrong one", async () => {
    expect((await start("Byte Me")).data).toEqual({ error: "code_required" });
    const wrong = await start("Byte Me", { resumeCode: "222222" });
    expect(wrong.res.status).toBe(409);
    expect(wrong.data).toEqual({ error: "code_required" });
  });

  it("starts with the registered name and lets the partner join with the same code", async () => {
    const a = await start("  byte   ME ", { resumeCode: "111111" });
    expect(a.res.status).toBe(200);
    expect(a.data.callsign).toBe("Byte Me");
    expect(a.data.resumeCode).toBe("111111");
    at(MIN);
    const b = await start("Byte Me", { resumeCode: "111111" });
    expect(b.res.status).toBe(200);
    expect(b.cookie).not.toBe("");
    expect(b.data.startTime).toBe(T0);
  });

  it("does not count successful logins against the wrong-code allowance", async () => {
    for (let i = 0; i < 8; i++) {
      expect((await start("Byte Me", { resumeCode: "111111" })).res.status).toBe(200);
    }
  });

  it("locks a team name after 5 wrong codes", async () => {
    for (let i = 0; i < 5; i++) await start("Null Pointers", { resumeCode: "000000" });
    expect((await start("Null Pointers", { resumeCode: "222222" })).res.status).toBe(429);
  });

  it("shows the case-file link once a team is in", async () => {
    process.env.CASE_FILE_URL = "https://example.com/case-file.zip";
    const r = await start("Byte Me", { resumeCode: "111111" });
    expect(r.data.caseFileUrl).toBe("https://example.com/case-file.zip");
  });
});

describe("escalating lockout", () => {
  it("waits 3 s for the first 5 misses, 30 s up to 10, then 2 min", async () => {
    const { cookie } = await start("Guessers");
    const waits: number[] = [];
    let t = 0;
    for (let i = 0; i < 11; i++) {
      const body = await (await verify(cookie, WRONG)).json();
      waits.push(body.cooldownMs);
      t += body.cooldownMs;
      at(t);
    }
    expect(waits).toEqual([3000, 3000, 3000, 3000, 3000, 30_000, 30_000, 30_000, 30_000, 30_000, 120_000]);
  });

  it("enforces the longer wait on the server", async () => {
    const { cookie } = await start("Guessers");
    let t = 0;
    for (let i = 0; i < 6; i++) {
      await verify(cookie, WRONG);
      t += 3000;
      at(t);
    }
    const early = await verify(cookie, CORRECT);
    expect(early.status).toBe(429);
  });
});

describe("leaderboard close-finish flag", () => {
  it("flags teams that finish within 3 minutes of each other", async () => {
    const a = await start("Alpha");
    const b = await start("Bravo");
    const c = await start("Charlie");
    at(10 * MIN);
    await verify(a.cookie);
    at(12 * MIN);
    await verify(b.cookie);
    at(30 * MIN);
    await verify(c.cookie);
    for (const s of [a, b, c]) await claim(s.cookie);
    const body = await (await leaderboardGET(req("/api/leaderboard?secret=test-board-secret"))).json();
    const flags = Object.fromEntries(
      body.entries.map((e: { teamCallsign: string; closeFinish: string[] }) => [e.teamCallsign, e.closeFinish]),
    );
    expect(flags).toEqual({ Alpha: ["Bravo"], Bravo: ["Alpha"], Charlie: [] });
  });
});
