/**
 * Per-account signal summarisation for the accounts table.
 *
 * Takes the raw signal list + threat_alerts for one account, plus the
 * org's visible-category preferences, and returns up to N chips for
 * the "Signals" cell.
 *
 * Ranking: category sortPriority × recency × count. Categories the
 * user has hidden are dropped from chip selection AND from the
 * "+N more" count (so the user doesn't see a 'more' badge teasing
 * categories they've already disabled).
 */

import { classifyType, SIGNAL_CATEGORY_BY_KEY, type SignalCategory } from "./signalCategories";

interface SignalEvent {
  signal_type: string;
  signal_data: Record<string, unknown> | null;
  detected_at: string;
}

interface ThreatAlert {
  severity?: string;
  is_actively_exploited?: boolean;
  title?: string;
}

export interface AccountSignalChip {
  category: SignalCategory;
  label: string;
  /** What this chip is showing — number of signals in the category, or
   *  a KEV count override, etc. Rendered in the chip with separator. */
  count: number;
  /** ISO of the freshest signal in this category for this account. */
  latest_at: string | null;
  /** True when the chip represents KEV-only CVEs (rose tone bumped). */
  is_kev: boolean;
  tone: "accent" | "amber" | "rose" | "violet" | "blue" | "muted";
  title: string;
}

export interface AccountSignalSummary {
  chips: AccountSignalChip[];
  /** Number of categories with signals beyond the top N we surfaced. */
  more_count: number;
  /** Label list of the overflow categories — fed into the +N tooltip
   *  so the user can see what's hidden without clicking through. */
  more_labels: string[];
  /** Total signals across all visible categories. */
  total_visible: number;
}

export function summariseAccountSignals(
  signals: SignalEvent[],
  threatAlerts: ThreatAlert[] | null,
  visibleCategories: ReadonlySet<SignalCategory>,
  maxChips = 3,
): AccountSignalSummary {
  // Bucket signals by category — skip ones the user doesn't care about.
  const byCategory: Record<string, { count: number; latest_at: string | null }> = {};
  for (const s of signals) {
    const cat = classifyType(s.signal_type);
    if (!visibleCategories.has(cat)) continue;
    const entry = byCategory[cat] ?? { count: 0, latest_at: null };
    entry.count += 1;
    if (!entry.latest_at || s.detected_at > entry.latest_at) {
      entry.latest_at = s.detected_at;
    }
    byCategory[cat] = entry;
  }

  // CVE chip — synthesised from threat_alerts rather than counting per
  // signal row, because the source of truth for the CVE count is the
  // companies.threat_alerts JSON. KEV count is what matters most.
  if (visibleCategories.has("cve_exposure") && threatAlerts?.length) {
    const kev = threatAlerts.filter((a) => a.is_actively_exploited).length;
    const total = threatAlerts.length;
    byCategory["cve_exposure"] = {
      count: kev > 0 ? kev : total,
      latest_at: null, // threat alerts have published_at on individual rows; not needed for sort here
    };
  }

  // Rank: known category sort priority first, then count desc.
  const entries = Object.entries(byCategory)
    .map(([cat, v]) => {
      const meta = SIGNAL_CATEGORY_BY_KEY[cat as SignalCategory];
      return {
        category: cat as SignalCategory,
        count: v.count,
        latest_at: v.latest_at,
        priority: meta?.sortPriority ?? 99,
        label: meta?.label ?? cat,
        tone: meta?.tone ?? "muted",
        description: meta?.description ?? "",
      };
    })
    .sort((a, b) => a.priority - b.priority);

  const topN = entries.slice(0, maxChips);
  const overflow = entries.slice(maxChips);
  const more = overflow.length;

  const chips: AccountSignalChip[] = topN.map((e) => {
    const isKev = e.category === "cve_exposure" && !!(threatAlerts ?? []).find((t) => t.is_actively_exploited);
    return {
      category: e.category,
      label: shortenLabel(e.category, e.label),
      count: e.count,
      latest_at: e.latest_at,
      is_kev: isKev,
      tone: isKev ? "rose" : e.tone,
      title: e.description,
    };
  });

  return {
    chips,
    more_count: more,
    more_labels: overflow.map((e) => e.label),
    total_visible: entries.reduce((s, e) => s + e.count, 0),
  };
}

// Chip labels need to be SHORT — they sit in a 280px column with up to
// 3 chips alongside. "Security leaders" works in Settings but is too
// long inline. Compact per-category overrides:
const CHIP_LABEL_OVERRIDES: Partial<Record<SignalCategory, string>> = {
  security_leadership: "SEC LEAD",
  leadership_change: "LEAD",
  funding: "FUNDED",
  acquisition: "M&A",
  partnership: "PARTNER",
  expansion: "EXPAND",
  product_launch: "LAUNCH",
  hiring: "HIRING",
  cyber_job_intent: "JD INTENT",
  cve_exposure: "KEV",
  breach: "BREACH",
  tech_change: "TECH",
  security_posture: "POSTURE",
  enterprise_readiness: "ENT-READY",
  company_news: "NEWS",
  person_activity: "PERSON",
  social_chatter: "SOCIAL",
  other_signals: "OTHER",
};

function shortenLabel(cat: SignalCategory, fallback: string): string {
  return CHIP_LABEL_OVERRIDES[cat] ?? fallback;
}
