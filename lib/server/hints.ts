import "server-only";
import { createHash } from "node:crypto";
import { getContent, type HintGroup } from "./content";

export type { HintGroup };

/** Hint catalog (vague -> direct; the last hint in a group gives the mechanics). Server-only. */
export function getCatalog(): readonly HintGroup[] {
  return getContent().hints;
}

export function getGroup(artifact: number): HintGroup | undefined {
  return getCatalog().find((g) => g.artifact === artifact);
}

/**
 * Opaque public id for a hint group. Derived from the title so it is stable, but carries
 * no slot number: the client never learns which artifact holds which code part.
 */
export function groupId(grp: HintGroup): string {
  return createHash("sha256").update(`hint-group:${grp.title}`).digest("hex").slice(0, 10);
}

export function getGroupById(id: string): HintGroup | undefined {
  return getCatalog().find((g) => groupId(g) === id);
}

/** Display order sent to clients: the roadmap (artifact 0) first, then alphabetical by title. */
export function orderedCatalog(): readonly HintGroup[] {
  return [...getCatalog()].sort((a, b) =>
    a.artifact === 0 ? -1 : b.artifact === 0 ? 1 : a.title.localeCompare(b.title),
  );
}

/** Copy shown only after a successful override (kept server-side so it is not spoiled). */
export function vaultLines(): readonly string[] {
  return getContent().vault.lines;
}

/** Shown before a claim exists (no rank yet). */
export const NEUTRAL_BANNER = "COMPLETE THE CLAIM FORM TO RECORD YOUR PROVISIONAL RANK.";

/** Banner for a real rank, or the neutral one when there is no rank yet. */
export function bannerForRank(rank: number | null): string {
  return rank ? bannerFor(rank) : NEUTRAL_BANNER;
}

/** Certificate banner: only rank 1 is promised the trophy. */
export function bannerFor(rank: number): string {
  const { winnerBanner, rankBanner } = getContent().vault;
  return rank <= 1 ? winnerBanner : rankBanner.replace("{rank}", String(rank));
}
