import { afterEach, describe, expect, it, vi } from "vitest";
import "./helpers";
import { checkCode, parseParts } from "@/lib/server/codes";
import { bannerFor, getCatalog } from "@/lib/server/hints";
import { getStore, redisEnv } from "@/lib/server/store";
import { getContent, resetContentCache } from "@/lib/server/content";
import {
  computeTimes,
  cooldownRemaining,
  leaderboardSecretMatches,
  normalizeCallsign,
  rawSeconds,
  signSessionId,
  verifySessionCookie,
  type Session,
} from "@/lib/server/session";
import { CORRECT } from "./helpers";

describe("scoring math", () => {
  it("floors elapsed seconds and adds penalties", () => {
    const start = 1_000_000;
    expect(rawSeconds(start, start + 999)).toBe(0);
    expect(rawSeconds(start, start + 61_999)).toBe(61);
    expect(computeTimes(start, start + 125_500, 240)).toEqual({
      rawTime: 125,
      penaltyTime: 240,
      totalScoreTime: 365,
    });
  });

  it("never returns negative time when the clock skews", () => {
    expect(rawSeconds(10_000, 5_000)).toBe(0);
  });

  it("computes the remaining 3 s cooldown", () => {
    const s = { lastFailAt: 1000 } as Session;
    expect(cooldownRemaining(s, 1000)).toBe(3000);
    expect(cooldownRemaining(s, 3500)).toBe(500);
    expect(cooldownRemaining(s, 4000)).toBe(0);
    expect(cooldownRemaining({ lastFailAt: null } as Session, 0)).toBe(0);
  });
});

describe("code check", () => {
  it("accepts the answer key in all input forms", () => {
    expect(checkCode(parseParts({ parts: CORRECT })!)).toBe(true);
    expect(checkCode(parseParts({ code: "123-456-789-246-135-864" })!)).toBe(true);
    expect(checkCode(parseParts({ code: "123456789246135864" })!)).toBe(true);
  });

  it("rejects any wrong part", () => {
    for (let i = 0; i < 6; i++) {
      const p = [...CORRECT];
      p[i] = p[i] === "000" ? "001" : "000";
      expect(checkCode(p)).toBe(false);
    }
    expect(checkCode(["864", "135", "246", "789", "456", "123"])).toBe(false);
  });

  it("rejects malformed payloads", () => {
    expect(parseParts(null)).toBeNull();
    expect(parseParts({})).toBeNull();
    expect(parseParts({ parts: ["123", "456"] })).toBeNull();
    expect(parseParts({ parts: ["64", "456", "789", "246", "135", "864"] })).toBeNull();
    expect(parseParts({ parts: ["1234", "456", "789", "246", "135", "864"] })).toBeNull();
    expect(parseParts({ parts: ["abc", "456", "789", "246", "135", "864"] })).toBeNull();
    expect(parseParts({ code: "123-456-789" })).toBeNull();
  });
});

describe("call-sign", () => {
  it("trims and bounds length", () => {
    expect(normalizeCallsign("  Team   Rocket ")).toEqual({ display: "Team Rocket", key: "team rocket" });
    expect(normalizeCallsign("")).toBeNull();
    expect(normalizeCallsign("   ")).toBeNull();
    expect(normalizeCallsign("x".repeat(33))).toBeNull();
    expect(normalizeCallsign("x".repeat(32))).not.toBeNull();
    expect(normalizeCallsign(42)).toBeNull();
  });
});

describe("cookie signing", () => {
  it("round-trips and rejects tampering", () => {
    const signed = signSessionId("abc-123");
    expect(verifySessionCookie(signed)).toBe("abc-123");
    expect(verifySessionCookie(signed.replace("abc", "abd"))).toBeNull();
    expect(verifySessionCookie(signed.slice(0, -2) + "xx")).toBeNull();
    expect(verifySessionCookie("abc-123")).toBeNull();
    expect(verifySessionCookie(undefined)).toBeNull();
  });
});

describe("leaderboard secret", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("stays locked when LEADERBOARD_SECRET is unset", () => {
    vi.stubEnv("LEADERBOARD_SECRET", "");
    expect(leaderboardSecretMatches("")).toBe(false);
    expect(leaderboardSecretMatches("anything")).toBe(false);
    expect(leaderboardSecretMatches(null)).toBe(false);
  });
  it("matches only the configured secret", () => {
    vi.stubEnv("LEADERBOARD_SECRET", "hunter2");
    expect(leaderboardSecretMatches("hunter2")).toBe(true);
    expect(leaderboardSecretMatches("hunter3")).toBe(false);
  });
});

describe("hint catalog", () => {
  it("has the expected groups, counts and penalties", () => {
    expect(getCatalog().map((g) => [g.artifact, g.hints.length, g.penalties])).toEqual([
      [0, 1, [0]],
      [1, 2, [90, 210]],
      [2, 2, [60, 180]],
      [3, 2, [60, 120]],
      [4, 2, [60, 120]],
      [5, 3, [30, 60, 90]],
      [6, 3, [30, 45, 60]],
    ]);
    expect(getCatalog()[0].unlockAfterSeconds).toBe(600);
  });
});

describe("production guards", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    (globalThis as { __scesaKV?: unknown }).__scesaKV = undefined;
  });

  it("throws when SESSION_SECRET is unset in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "");
    expect(() => signSessionId("abc")).toThrow(/SESSION_SECRET/);
    expect(() => verifySessionCookie("abc.def")).toThrow(/SESSION_SECRET/);
  });

  it("refuses the memory store in production unless ALLOW_MEMORY_STORE=1", () => {
    (globalThis as { __scesaKV?: unknown }).__scesaKV = undefined;
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_MEMORY_STORE", "");
    expect(() => getStore()).toThrow(/ALLOW_MEMORY_STORE/);
    vi.stubEnv("ALLOW_MEMORY_STORE", "1");
    expect(getStore()).toBeDefined();
  });

  it("uses the memory store freely outside production", () => {
    (globalThis as { __scesaKV?: unknown }).__scesaKV = undefined;
    vi.stubEnv("NODE_ENV", "development");
    expect(getStore()).toBeDefined();
  });
});

describe("rank-dependent banner", () => {
  it("only promises the trophy to rank 1", () => {
    expect(bannerFor(1)).toBe("DEMO: You finished first! Present this screen to an organiser.");
    expect(bannerFor(3)).toBe("DEMO: Present this screen to an organiser — OFFICIAL RANK #3.");
  });
});

describe("game content loader", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetContentCache();
  });

  const sample = {
    codes: ["111", "222", "333", "444", "555", "999"],
    hints: [{ artifact: 0, title: "T", penalties: [0], hints: ["h"] }],
    vault: { lines: ["done"], winnerBanner: "win", rankBanner: "rank #{rank}" },
  };
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v), "utf8").toString("base64");

  it("loads GAME_CONTENT from base64 env", () => {
    vi.stubEnv("GAME_CONTENT", b64(sample));
    resetContentCache();
    expect(checkCode(["111", "222", "333", "444", "555", "999"])).toBe(true);
    expect(bannerFor(4)).toBe("rank #4");
  });

  it("refuses to fall back to the demo puzzle in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GAME_CONTENT", "");
    vi.stubEnv("GAME_CONTENT_FILE", "");
    resetContentCache();
    expect(() => getContent()).toThrow(/GAME_CONTENT must be set/);
  });

  it("accepts the older flat penaltySeconds format", () => {
    vi.stubEnv(
      "GAME_CONTENT",
      b64({ ...sample, hints: [{ artifact: 0, title: "T", penaltySeconds: 45, hints: ["a", "b"] }] }),
    );
    resetContentCache();
    expect(getContent().hints[0].penalties).toEqual([45, 45]);
  });

  it("rejects malformed content", () => {
    vi.stubEnv("GAME_CONTENT", b64({ ...sample, codes: ["1", "2"] }));
    resetContentCache();
    expect(() => getContent()).toThrow(/codes must be six/);
    vi.stubEnv("GAME_CONTENT", b64({ ...sample, vault: { ...sample.vault, rankBanner: "no placeholder" } }));
    resetContentCache();
    expect(() => getContent()).toThrow(/rankBanner/);
  });
});

describe("redis env detection", () => {
  it("accepts standard and custom-prefixed Upstash REST names", () => {
    expect(redisEnv({ KV_REST_API_URL: "u", KV_REST_API_TOKEN: "t" })).toEqual({ url: "u", token: "t" });
    expect(
      redisEnv({
        storage_KV_REST_API_URL: "pu",
        storage_KV_REST_API_TOKEN: "pt",
        storage_KV_REST_API_READ_ONLY_TOKEN: "ro",
        storage_REDIS_URL: "redis://x",
      }),
    ).toEqual({ url: "pu", token: "pt" });
    expect(redisEnv({ storage_REDIS_URL: "redis://x" })).toBeNull();
    expect(redisEnv({ storage_KV_REST_API_URL: "pu" })).toBeNull();
  });
});
