// Shared client/server shapes. Contains NO answers or hint text.

export interface HintGroupView {
  /** Opaque group id (no slot number), used to request hints. */
  id: string;
  title: string;
  /** Penalty in seconds for each hint, in order. */
  penalties: number[];
  /** Epoch ms when this group unlocks, or null when always available. */
  unlocksAt: number | null;
  total: number;
  /** Texts of hints already revealed, in order. */
  revealed: string[];
}

export interface SolvedTimes {
  rawTime: number;
  penaltyTime: number;
  totalScoreTime: number;
  completedAt: string;
}

export interface Claim {
  teamCallsign: string;
  partner1Name: string;
  partner1Adm: string;
  partner2Name: string;
  partner2Adm: string;
  rawTime: number;
  penaltyTime: number;
  totalScoreTime: number;
  completedAt: string;
}

export interface VaultContent {
  lines: readonly string[];
  banner: string;
}

export interface SessionView {
  callsign: string;
  resumeCode: string;
  startTime: number;
  serverNow: number;
  penaltySeconds: number;
  hints: HintGroupView[];
  cooldownMs: number;
  solved: SolvedTimes | null;
  vault: VaultContent | null;
  claim: Claim | null;
  rank: number | null;
  /** Download link for the case file, when the organisers set one. */
  caseFileUrl: string | null;
  /** Epoch ms after which codes and hints are refused, or null. */
  endsAt: number | null;
}

export interface EventInfo {
  startsAt: number | null;
  endsAt: number | null;
  teamCodes: boolean;
  serverNow: number;
}
