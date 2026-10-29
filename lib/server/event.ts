import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Online-event settings, all optional (unset = the original walk-in behaviour):
 *   EVENT_START    ISO time every team's clock starts from (e.g. 2026-10-25T14:00:00+03:00).
 *                  Before it, nobody can start; after it, every session starts at it.
 *   EVENT_END      ISO time after which codes and hints are refused and no new team can start.
 *   TEAMS          base64 JSON roster [{ "callsign": "…", "code": "123456", "members": ["…", "…"] }]
 *                  (or TEAMS_FILE, a path). When set, only registered call-signs can play and each needs
 *                  its team code. A team listing a single member must find a partner before it can start.
 *   CASE_FILE_URL  Link to the case-file download, shown to teams once they are in.
 */
export interface Team {
  callsign: string;
  /** 6-digit access code; it doubles as the session's resume code. */
  code: string;
  /** Leader then partner, full names. Omitted = not tracked; one name = still needs a partner. */
  members?: string[];
}

export interface EventInfo {
  startsAt: number | null;
  endsAt: number | null;
  /** True when entry needs an organiser-issued team code. */
  teamCodes: boolean;
}

const g = globalThis as unknown as { __scesaRoster?: Map<string, Team> | null };

function parseTime(name: string): number | null {
  const v = process.env[name];
  if (!v) return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw new Error(`[scesa-override] ${name} is not a valid ISO date: ${v}`);
  return t;
}

export function eventStart(): number | null {
  return parseTime("EVENT_START");
}

export function eventEnd(): number | null {
  return parseTime("EVENT_END");
}

export function eventOver(now = Date.now()): boolean {
  const end = eventEnd();
  return end !== null && now >= end;
}

export function caseFileUrl(): string | null {
  return process.env.CASE_FILE_URL || null;
}

export function teamKey(callsign: string): string {
  return callsign.trim().replace(/\s+/g, " ").toLowerCase();
}

function validateRoster(raw: unknown): Map<string, Team> {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("[scesa-override] TEAMS must be a non-empty array");
  const map = new Map<string, Team>();
  for (const t of raw as Team[]) {
    if (!t || typeof t.callsign !== "string" || !t.callsign.trim() || t.callsign.length > 32) {
      throw new Error("[scesa-override] TEAMS entry has an invalid callsign");
    }
    if (typeof t.code !== "string" || !/^\d{6}$/.test(t.code)) {
      throw new Error(`[scesa-override] TEAMS entry "${t.callsign}" needs a 6-digit code`);
    }
    if (
      t.members !== undefined &&
      !(
        Array.isArray(t.members) &&
        t.members.length >= 1 &&
        t.members.length <= 2 &&
        t.members.every((m) => typeof m === "string" && m.trim().length > 0 && m.length <= 64)
      )
    ) {
      throw new Error(`[scesa-override] TEAMS entry "${t.callsign}" needs 1-2 member names`);
    }
    const key = teamKey(t.callsign);
    if (map.has(key)) throw new Error(`[scesa-override] TEAMS has a duplicate callsign "${t.callsign}"`);
    map.set(key, {
      callsign: t.callsign.trim().replace(/\s+/g, " "),
      code: t.code,
      ...(t.members && { members: t.members.map((m) => m.trim().replace(/\s+/g, " ")) }),
    });
  }
  return map;
}

function loadRoster(): Map<string, Team> | null {
  const b64 = process.env.TEAMS;
  if (b64) return validateRoster(JSON.parse(Buffer.from(b64, "base64").toString("utf8")));
  const file = process.env.TEAMS_FILE;
  if (file) return validateRoster(JSON.parse(readFileSync(path.resolve(file), "utf8")));
  return null;
}

export function needsPartner(team: Team): boolean {
  return team.members !== undefined && team.members.length < 2;
}

/** Registered teams by normalised call-sign, or null for open entry. */
export function roster(): Map<string, Team> | null {
  if (g.__scesaRoster === undefined) g.__scesaRoster = loadRoster();
  return g.__scesaRoster;
}

/** Test helper: force a reload on next access. */
export function resetRosterCache(): void {
  g.__scesaRoster = undefined;
}

export function eventInfo(): EventInfo {
  return { startsAt: eventStart(), endsAt: eventEnd(), teamCodes: roster() !== null };
}
