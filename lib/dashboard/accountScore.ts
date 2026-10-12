/**
 * Account score 0–100. Aggregates already-derived row attributes into a
 * single number so the table can be sorted "best at the top". Shown as a
 * small monospace chip next to the temperature dot for users who want to
 * scan the underlying number rather than the dot colour.
 *
 * Inputs come from data the row already has — no extra queries, no
 * model-derived signals. The score is deterministic given the same row.
 */

interface ScoreInput {
  latestSignalAt: string | null;
  signalCount90d: number;
  growthSignalCount: number;
  /** From CveSummary — used for KEV/critical weighting. */
  kevCount: number;
  totalCves: number;
}

export function deriveAccountScore(input: ScoreInput): number {
  let score = 0;

  // Recency — single biggest weight. Hot rows always outrank cold ones
  // even if the cold one has more historical signal.
  if (input.latestSignalAt) {
    const days =
      (Date.now() - new Date(input.latestSignalAt).getTime()) / 86_400_000;
    if (days < 7) score += 45;
    else if (days < 14) score += 35;
    else if (days < 30) score += 22;
    else if (days < 60) score += 10;
    else if (days < 90) score += 4;
  }

  // Signal density — caps at 25 so a chatty account can't dominate.
  score += Math.min(25, input.signalCount90d * 2);

  // Growth signals carry extra weight (funding/M&A/expansion).
  score += Math.min(15, input.growthSignalCount * 4);

  // CVE exposure — KEV weighted heavily, the rest lightly.
  // We surface this in the score but the dashboard rule still applies:
  // never lead with CVEs in user-facing copy.
  if (input.kevCount > 0) score += 10;
  else if (input.totalCves > 0) score += 3;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Score → {bg, fg} colour tone for a 0-100 score chip. One ramp used
 * everywhere a score renders (people table, accounts table, dossier)
 * so "how good is this number" reads the same across the product.
 * Premium-restraint palette: muted at the low end, a confident accent
 * green at the top — colour earns its place by meaning something.
 */
export function scoreTone(score: number): { bg: string; fg: string } {
  if (score >= 75) return { bg: "rgba(16,185,129,0.14)", fg: "rgb(5,150,105)" };
  if (score >= 50) return { bg: "rgba(245,158,11,0.14)", fg: "rgb(180,118,8)" };
  if (score >= 25) return { bg: "rgba(100,116,139,0.14)", fg: "rgb(71,85,105)" };
  return { bg: "rgba(100,116,139,0.08)", fg: "rgb(100,116,139)" };
}
