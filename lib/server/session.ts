import "server-only";
import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { Claim, HintGroupView, SessionView, SolvedTimes } from "@/lib/types";
import { checkCode } from "./codes";
import { caseFileUrl, eventEnd, eventOver, eventStart, roster, teamKey } from "./event";
import { bannerForRank, getGroupById, groupId, orderedCatalog, vaultLines } from "./hints";
import { getStore } from "./store";

export const COOKIE_NAME = "sso_sid";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
export const COOLDOWN_MS = 3000;
/** Lockout after the nth wrong code: short at first, then long enough to make guessing a part impractical. */
export const COOLDOWN_STEPS: readonly { upTo: number; ms: number }[] = [
  { upTo: 5, ms: COOLDOWN_MS },
  { upTo: 10, ms: 30_000 },
  { upTo: Infinity, ms: 120_000 },
];
export const CALLSIGN_MAX = 32;
export const RESUME_MAX_FAILS = 5;
export const RESUME_FAIL_WINDOW_MS = 10 * 60 * 1000;

export interface Session {
  id: string;
  callsign: string;
  /** 6-digit credential needed to resume without the original cookie. */
  resumeCode: string;
  startTime: number;
  /** artifact -> number of hints revealed (always a prefix). */
  revealed: Record<string, number>;
  penaltySeconds: number;
  attempts: number;
  lastFailAt: number | null;
  solved: (SolvedTimes & { solvedAt: number }) | null;
  claimed: boolean;
}

const k = {
  session: (id: string) => `session:${id}`,
  callsign: (norm: string) => `callsign:${norm}`,
  lock: (id: string) => `lock:${id}`,
  resumeFails: (norm: string) => `resumefail:${norm}`,
  claim: (id: string) => `claim:${id}`,
  claims: "claims",
  started: "stats:started",
  solved: "stats:solved",
};

// ---------------------------------------------------------------- signing

const g = globalThis as unknown as { __scesaDevSecret?: string };

function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length > 0) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production");
  }
  if (!g.__scesaDevSecret) {
    g.__scesaDevSecret = randomBytes(32).toString("hex");
    console.warn(
      "[scesa-override] SESSION_SECRET not set; using a random per-process dev secret. Sessions reset on restart.",
    );
  }
  return g.__scesaDevSecret;
}

function mac(id: string): string {
  return createHmac("sha256", sessionSecret()).update(id).digest("base64url");
}

export function signSessionId(id: string): string {
  return `${id}.${mac(id)}`;
}

/** Returns the session id if the cookie value carries a valid signature. */
export function verifySessionCookie(value: string | undefined | null): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  const sig = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(mac(id));
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  return id;
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  };
}

// ---------------------------------------------------------------- timing math

/** Whole elapsed seconds between start and `now` (never negative). */
export function rawSeconds(startTime: number, now: number): number {
  return Math.max(0, Math.floor((now - startTime) / 1000));
}

/** Official time = floor((now - startTime)/1000) + penaltySeconds. */
export function computeTimes(startTime: number, now: number, penaltySeconds: number) {
  const rawTime = rawSeconds(startTime, now);
  return { rawTime, penaltyTime: penaltySeconds, totalScoreTime: rawTime + penaltySeconds };
}

export function cooldownFor(fails: number): number {
  return COOLDOWN_STEPS.find((step) => fails <= step.upTo)!.ms;
}

export function cooldownRemaining(s: Session, now: number): number {
  if (s.lastFailAt === null) return 0;
  // Every attempt before solving was a miss, so attempts counts the failures.
  return Math.max(0, s.lastFailAt + cooldownFor(s.attempts) - now);
}

// ---------------------------------------------------------------- helpers

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: Record<string, unknown>,
  ) {
    super(String(body.error ?? status));
  }
}

export function normalizeCallsign(input: unknown): { display: string; key: string } | null {
  if (typeof input !== "string") return null;
  const display = input.trim().replace(/\s+/g, " ");
  if (display.length < 1 || display.length > CALLSIGN_MAX || /[\u0000-\u001f\u007f]/.test(display)) {
    return null;
  }
  return { display, key: display.toLowerCase() };
}

async function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const store = getStore();
  const key = k.lock(id);
  for (let i = 0; i < 60; i++) {
    if (await store.setNX(key, 1, 5000)) {
      try {
        return await fn();
      } finally {
        await store.del(key);
      }
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new HttpError(503, { error: "busy" });
}

async function save(s: Session) {
  await getStore().set(k.session(s.id), s);
}

export async function loadSession(id: string | null): Promise<Session | null> {
  if (!id) return null;
  return getStore().get<Session>(k.session(id));
}

function hintViews(s: Session): HintGroupView[] {
  return orderedCatalog().map((grp) => {
    const n = Math.min(s.revealed[String(grp.artifact)] ?? 0, grp.hints.length);
    return {
      id: groupId(grp),
      title: grp.title,
      penalties: [...grp.penalties],
      unlocksAt: grp.unlockAfterSeconds ? s.startTime + grp.unlockAfterSeconds * 1000 : null,
      total: grp.hints.length,
      revealed: grp.hints.slice(0, n),
    };
  });
}

export async function rankOf(id: string): Promise<number | null> {
  const entries = await leaderboardEntries();
  const idx = entries.findIndex((e) => e.sessionId === id);
  return idx === -1 ? null : idx + 1;
}

export async function toView(s: Session, now = Date.now()): Promise<SessionView> {
  let claim: Claim | null = null;
  let rank: number | null = null;
  if (s.claimed) {
    claim = await getStore().get<Claim>(k.claim(s.id));
    rank = await rankOf(s.id);
  }
  return {
    callsign: s.callsign,
    resumeCode: s.resumeCode,
    startTime: s.startTime,
    serverNow: now,
    penaltySeconds: s.penaltySeconds,
    hints: hintViews(s),
    cooldownMs: s.solved ? 0 : cooldownRemaining(s, now),
    solved: s.solved
      ? {
          rawTime: s.solved.rawTime,
          penaltyTime: s.solved.penaltyTime,
          totalScoreTime: s.solved.totalScoreTime,
          completedAt: s.solved.completedAt,
        }
      : null,
    vault: s.solved ? { lines: vaultLines(), banner: bannerForRank(rank) } : null,
    claim,
    rank,
    caseFileUrl: caseFileUrl(),
    endsAt: eventEnd(),
  };
}

// ---------------------------------------------------------------- operations

function resumeCodeMatches(provided: unknown, expected: string | undefined): boolean {
  if (typeof provided !== "string" || !expected) return false;
  const a = Buffer.from(provided.trim());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Start a new session, or resume the existing one for the same call-sign when the
 * caller holds that session's cookie or its resume code. Otherwise 409 callsign_taken.
 */
export async function startSession(
  callsignInput: unknown,
  resumeCodeInput?: unknown,
  cookieSessionId?: string | null,
): Promise<Session> {
  const cs = normalizeCallsign(callsignInput);
  if (!cs) throw new HttpError(400, { error: "invalid_callsign" });
  const now = Date.now();
  const startsAt = eventStart();
  if (startsAt !== null && now < startsAt) throw new HttpError(403, { error: "not_started", startsAt });
  const teams = roster();
  const team = teams ? teams.get(teamKey(cs.display)) : undefined;
  if (teams && !team) throw new HttpError(403, { error: "not_registered" });
  const store = getStore();
  const indexKey = k.callsign(cs.key);
  const attempted = resumeCodeInput !== undefined && resumeCodeInput !== null && resumeCodeInput !== "";
  // Count the attempt atomically before comparing, so parallel guesses can't all slip under the cap.
  const codeMatches = async (expected: string) => {
    const attempts = await store.incrEx(k.resumeFails(cs.key), RESUME_FAIL_WINDOW_MS);
    if (attempts > RESUME_MAX_FAILS) throw new HttpError(429, { error: "too_many_attempts" });
    if (!resumeCodeMatches(resumeCodeInput, expected)) return false;
    // Only misses count: both partners and device switches must not use up the allowance.
    await store.del(k.resumeFails(cs.key));
    return true;
  };

  const existingId = await store.get<string>(indexKey);
  if (existingId) {
    const existing = await loadSession(existingId);
    if (existing) {
      if (cookieSessionId === existing.id) return existing;
      if (attempted && (await codeMatches(existing.resumeCode))) return existing;
      throw new HttpError(409, { error: team ? "code_required" : "callsign_taken" });
    }
  }

  if (eventOver(now)) throw new HttpError(403, { error: "event_over" });
  if (team && !(attempted && (await codeMatches(team.code)))) {
    throw new HttpError(409, { error: "code_required" });
  }

  const s: Session = {
    id: randomUUID(),
    callsign: team ? team.callsign : cs.display,
    resumeCode: team ? team.code : String(randomInt(0, 1_000_000)).padStart(6, "0"),
    // With a shared start, a late team's clock still counts from the start.
    startTime: startsAt ?? now,
    revealed: {},
    penaltySeconds: 0,
    attempts: 0,
    lastFailAt: null,
    solved: null,
    claimed: false,
  };
  await save(s);
  if (existingId) {
    // Stale index (points at a missing session): overwrite it and start fresh.
    await store.set(indexKey, s.id);
  } else if (!(await store.setNX(indexKey, s.id))) {
    // Lost a race with another start for the same call-sign: it belongs to them now.
    await store.del(k.session(s.id));
    throw new HttpError(409, { error: "callsign_taken" });
  }
  await store.incr(k.started);
  return s;
}

export async function revealHint(
  id: string,
  groupInput: unknown,
  indexInput: unknown,
): Promise<{ text: string; session: Session }> {
  if (typeof groupInput !== "string" || typeof indexInput !== "number" || !Number.isInteger(indexInput)) {
    throw new HttpError(400, { error: "invalid_hint" });
  }
  const index = indexInput;
  const grp = getGroupById(groupInput);
  if (!grp || index < 0 || index >= grp.hints.length) {
    throw new HttpError(400, { error: "invalid_hint" });
  }
  const artifact = grp.artifact;
  return withLock(id, async () => {
    const s = await loadSession(id);
    if (!s) throw new HttpError(401, { error: "no_session" });
    const n = s.revealed[String(artifact)] ?? 0;
    if (index < n) return { text: grp.hints[index], session: s }; // repeat: no charge
    if (s.solved) throw new HttpError(409, { error: "already_solved" });
    if (eventOver()) throw new HttpError(403, { error: "event_over" });
    if (index > n) throw new HttpError(409, { error: "out_of_order", next: n });
    const unlocksAt = s.startTime + (grp.unlockAfterSeconds ?? 0) * 1000;
    const now = Date.now();
    if (now < unlocksAt) throw new HttpError(409, { error: "not_yet_available", unlocksInMs: unlocksAt - now });
    s.revealed[String(artifact)] = n + 1;
    s.penaltySeconds += grp.penalties[index];
    await save(s);
    return { text: grp.hints[index], session: s };
  });
}

export type VerifyResult =
  | { kind: "solved"; session: Session }
  | { kind: "wrong"; session: Session }
  | { kind: "cooldown"; retryAfterMs: number };

export async function verifyCode(id: string, parts: string[] | null): Promise<VerifyResult> {
  return withLock(id, async () => {
    const s = await loadSession(id);
    if (!s) throw new HttpError(401, { error: "no_session" });
    if (s.solved) return { kind: "solved", session: s };
    if (!parts) throw new HttpError(400, { error: "malformed" });
    const now = Date.now();
    if (eventOver(now)) throw new HttpError(403, { error: "event_over" });
    const wait = cooldownRemaining(s, now);
    if (wait > 0) return { kind: "cooldown", retryAfterMs: wait };

    s.attempts += 1;
    if (checkCode(parts)) {
      const t = computeTimes(s.startTime, now, s.penaltySeconds);
      s.solved = { ...t, completedAt: new Date(now).toISOString(), solvedAt: now };
      s.lastFailAt = null;
      await save(s);
      await getStore().incr(k.solved);
      return { kind: "solved", session: s };
    }
    s.lastFailAt = now;
    await save(s);
    return { kind: "wrong", session: s };
  });
}

const NAME_MIN = 2;
const NAME_MAX = 60;
const ADM_RE = /^[A-Za-z0-9/-]{3,20}$/;

function cleanName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  if (t.length < NAME_MIN || t.length > NAME_MAX || /[\u0000-\u001f\u007f]/.test(t)) return null;
  return t;
}

function cleanAdm(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return ADM_RE.test(t) ? t : null;
}

export async function submitClaim(
  id: string,
  body: unknown,
): Promise<{ claim: Claim; rank: number | null; created: boolean }> {
  return withLock(id, async () => {
    const s = await loadSession(id);
    if (!s) throw new HttpError(401, { error: "no_session" });
    if (!s.solved) throw new HttpError(403, { error: "not_solved" });
    const store = getStore();
    if (s.claimed) {
      const existing = await store.get<Claim>(k.claim(s.id));
      if (existing) return { claim: existing, rank: await rankOf(s.id), created: false };
    }
    const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const fields = {
      partner1Name: cleanName(b.partner1Name),
      partner1Adm: cleanAdm(b.partner1Adm),
      partner2Name: cleanName(b.partner2Name),
      partner2Adm: cleanAdm(b.partner2Adm),
    };
    const invalid = Object.entries(fields)
      .filter(([, v]) => v === null)
      .map(([f]) => f);
    if (invalid.length) throw new HttpError(400, { error: "invalid_fields", fields: invalid });

    const claim: Claim = {
      teamCallsign: s.callsign,
      partner1Name: fields.partner1Name!,
      partner1Adm: fields.partner1Adm!,
      partner2Name: fields.partner2Name!,
      partner2Adm: fields.partner2Adm!,
      rawTime: s.solved.rawTime,
      penaltyTime: s.solved.penaltyTime,
      totalScoreTime: s.solved.totalScoreTime,
      completedAt: s.solved.completedAt,
    };
    await store.set(k.claim(s.id), claim);
    await store.sadd(k.claims, s.id);
    s.claimed = true;
    await save(s);
    return { claim, rank: await rankOf(s.id), created: true };
  });
}

export interface LeaderboardEntry extends Claim {
  rank: number;
  sessionId: string;
  /** Call-signs of other teams that finished within CLOSE_FINISH_MS: worth a look for shared answers. */
  closeFinish: string[];
}

export const CLOSE_FINISH_MS = 3 * 60 * 1000;

async function leaderboardEntries(): Promise<LeaderboardEntry[]> {
  const store = getStore();
  const ids = await store.smembers(k.claims);
  const rows = await Promise.all(
    ids.map(async (sessionId) => {
      const c = await store.get<Claim>(k.claim(sessionId));
      return c ? { ...c, sessionId } : null;
    }),
  );
  return rows
    .filter((r): r is Claim & { sessionId: string } => r !== null)
    .sort(
      (a, b) =>
        a.totalScoreTime - b.totalScoreTime ||
        a.completedAt.localeCompare(b.completedAt) ||
        a.sessionId.localeCompare(b.sessionId),
    )
    .map((r, i, all) => {
      const at = Date.parse(r.completedAt);
      const closeFinish = all
        .filter((o) => o !== r && Math.abs(Date.parse(o.completedAt) - at) <= CLOSE_FINISH_MS)
        .map((o) => o.teamCallsign);
      return { ...r, rank: i + 1, closeFinish };
    });
}

export async function getLeaderboard() {
  const store = getStore();
  const entries = (await leaderboardEntries()).map(({ sessionId: _omit, ...rest }) => {
    void _omit;
    return rest;
  });
  const [started, solved] = await Promise.all([
    store.get<number>(k.started),
    store.get<number>(k.solved),
  ]);
  return { entries, sessions: { started: started ?? 0, solved: solved ?? 0 } };
}

export function leaderboardSecretMatches(provided: string | null): boolean {
  // No default: the leaderboard stays locked until LEADERBOARD_SECRET is configured.
  const expected = process.env.LEADERBOARD_SECRET;
  if (!provided || !expected) return false;
  // Hash both sides so the compare is constant-length and timing-safe.
  const a = createHmac("sha256", "lb").update(provided).digest();
  const b = createHmac("sha256", "lb").update(expected).digest();
  return timingSafeEqual(a, b);
}
