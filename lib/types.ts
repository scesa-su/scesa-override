// Shared client/server shapes. Contains NO answers or hint text.

export interface HintGroupView {
  artifact: number;
  title: string;
  penaltySeconds: number;
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
}
