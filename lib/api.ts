import type { Claim, EventInfo, HintGroupView, SessionView, VaultContent } from "./types";

export interface ApiResult<T> {
  status: number;
  data: T;
}

async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data: data as T };
}

const post = <T>(path: string, body: unknown) =>
  call<T>(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  session: () => call<SessionView>("/api/session"),
  event: () => call<EventInfo>("/api/event"),
  start: (callsign: string, resumeCode?: string) =>
    post<SessionView>("/api/session/start", { callsign, resumeCode }),
  hint: (group: string, index: number) =>
    post<{ text: string; penaltySeconds: number; hints: HintGroupView[]; error?: string }>("/api/hint", {
      group,
      index,
    }),
  verify: (parts: string[]) =>
    post<
      | {
          ok: true;
          rawTime: number;
          penaltyTime: number;
          totalScoreTime: number;
          completedAt: string;
          vault: VaultContent;
        }
      | { ok: false; cooldownMs?: number; retryAfterMs?: number }
    >("/api/verify", { parts }),
  claim: (fields: {
    partner1Name: string;
    partner1Adm: string;
    partner2Name: string;
    partner2Adm: string;
  }) => post<{ claim: Claim; rank: number | null; banner: string; error?: string; fields?: string[] }>("/api/claim", fields),
};

export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtPenalty(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtMinutes(sec: number): string {
  return String(Math.round((sec / 60) * 100) / 100);
}
