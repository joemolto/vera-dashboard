"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Globe, Lock, Plug, Radar, Radio, ShieldCheck, Sparkles, Users } from "lucide-react";
import type { SecurityContactInfo } from "@/lib/dashboard/securityContact";
import { useOrg } from "@/components/dashboard/OrgContext";
import { useIntegrations } from "@/lib/dashboard/integrations";
import { SendToButton } from "@/components/dashboard/widgets/SendToButton";
import { useSetMonitoring } from "@/lib/dashboard/queries";

// LinkedIn brand mark — lucide-react doesn't ship it in this version
// (brand glyphs are deliberately limited). Tiny inline SVG keeps the
// icon visually consistent with the lucide line-art style.
function LinkedinMark({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.95v5.66H9.36V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}
import { RelativeTime } from "@/components/dashboard/primitives";
import {
  humanizeLabel,
  scrubBackendNames,
  SOCIAL_CHIP_LABELS,
} from "@/lib/dashboard/labels";
import {
  type CveSummary,
  type IntentLabel,
} from "@/lib/dashboard/cyberIntent";
import { countryFlag } from "@/lib/dashboard/countryFlag";
import { formatSizeBand } from "@/lib/dashboard/sizeBand";
import { logoUrl } from "@/lib/logoUrl";
import type { AccountSignalChip } from "@/lib/dashboard/accountSignals";
import { SignalWave } from "@/components/dashboard/widgets/viz/SignalWave";
import type { AccountVizData } from "@/components/dashboard/widgets/viz/types";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { cn } from "@/lib/utils";

export type Temperature = "hot" | "warm" | "cold";

export interface AccountRowData {
  domain: string;
  name: string;
  industry: string | null;
  country: string | null;
  size_band: string | null;
  /** Stack chips, ordered with Tier-A first. Top 4 shown in the Stack cell. */
  stack: string[];
  intent: IntentLabel | null;
  /** Signal wave data — 90d event timeline + verdict colour. */
  viz: AccountVizData;
  /** Printed revenue, e.g. "$1.1B" or null when unknown. */
  revenue: string | null;
  /** Per-account revenue potential for the client's deal economics
   * (null when org has no average_deal_size baseline configured). */
  potential: string | null;
  /** Composite Profile score 0-100 from account_profile_scorer.py.
   * Null on accounts whose monitor pass hasn't yet computed it
   * (e.g. brand-new watchlist entries before their first Phase G run). */
  profile_composite: number | null;
  /** Count of OPEN security/GRC vacancies read from the account's own job
   * board. Volume is the point: 20 open security roles says something is
   * happening regardless of any single advert. Null = we haven't read
   * their board yet (not the same as "not hiring"). */
  security_jobs: number | null;
  /** CVE exposure summary from companies.threat_alerts. */
  cves: CveSummary;
  /** Credential exposure (LeakRadar stealer-log / dark-web) from
   * companies.credential_exposure. Null until the first check runs. */
  credential_exposure: CredentialExposureSummary | null;
  latest_signal_headline: string | null;
  latest_signal_at: string | null;
  /** ISO. When this org started watching the account. */
  watching_since: string | null;
  /** ISO. When the engine last enriched the companies row. */
  last_enriched_at: string | null;
  /** When Vera last looked: last monitor pass, falling back to the
   * enrichment timestamp before the first pass. */
  last_checked_at: string | null;
  /** Aggregate 0–100 score derived in the parent. Drives default sort
   * and the small numeric chip next to the temperature dot. */
  score: number;
  /** Up to 3 category chips per row, filtered by the org's
   * visible_signal_categories preference. Replaces the old single
   * "Why now" label + dedicated CVEs column with one richer cell. */
  signal_chips: AccountSignalChip[];
  /** Number of categories with signals beyond the top 3. Renders as
   * "+N" badge. */
  signal_more: number;
  /** Labels of the overflow categories — surfaced in the +N hover
   * tooltip so the user can see what's not on display. */
  signal_more_labels: string[];
  /** Per-account social signals (Reddit / forums / web mentions etc.)
   * written by the engine's social_listener. Drives the Social cell —
   * count badge + hover popover. Empty for accounts without social
   * coverage; renders as "—". */
  social_signals: SocialSignalSummary[];
  /** Company LinkedIn URL for the small icon next to the company name.
   * Null if we don't have one yet (PL/Apollo didn't return one). */
  linkedin_url: string | null;
  /** Global companies.id — needed to unlock contacts from the drawer.
   *  Null until the account's companies row exists. */
  company_id: string | null;
  /** Watchlist row id — needed to pause/resume monitoring. */
  watchlist_id: string;
  /** Whether the weekly monitor scan is active for this account. */
  monitoring_active: boolean;
  /** ISO. When the next monitor pass is due (engine heat cadence). */
  next_monitor_at: string | null;
  /** Named security decision-maker for the account (CISO / Head of Security),
   * derived from the org's leads. Null when none identified yet. */
  security_contact: SecurityContactInfo | null;
}

/** Credential-exposure summary mirrored from companies.credential_exposure
 * (engine: enrichers/credential_exposure.py). Counts + recency only — we
 * surface the exposure, never the credentials. */
export interface CredentialExposureSummary {
  employees_compromised: number;
  third_parties_compromised: number;
  customers_compromised: number;
  recent_employees_90d: number;
  most_recent_surfaced: string | null;
  employee_passwords_captured: boolean | number;
  has_recent_exposure: boolean;
  checked_at?: string | null;
}

/** Compact projection of a social signal for the accounts table cell.
 * Only fields needed by the count badge + hover popover. */
export interface SocialSignalSummary {
  signal_type: string;
  /** What the rep sees in the popover — verbatim post excerpt or
   * the post's headline as a fallback. */
  excerpt: string;
  /** Our one-sentence summary of why a rep would care. Optional. */
  summary: string;
  /** Channel label (Reddit / Forum / Google etc.) — derived from
   * signal_source before passing in. */
  channel: string;
  url: string;
  detected_at: string;
}

// ---------------------------------------------------------------------------
// Column tracks — explicit pixel widths so header + rows + skeleton align
// and the table has a deterministic total min-width that forces horizontal
// scroll on viewports narrower than the table.
//
//   Account*  Temp   Why now  Posture  Latest signal  Industry  Country  Size  Stack  Watching  Enriched  ↗
//    sticky
// ---------------------------------------------------------------------------

//   Account*  Temp  Wave  People  Signals  Revenue  Potential  Latest signal  Country  Size  Stack  Watching  Enriched  ↗
//    sticky
// 2026-05-30: dropped "Why now" (130px) + "CVEs" (96px) → single
// "Signals" cell (280px). User-customisable via Settings → Signal
// categories. KEV / CVE chip is one of the available categories;
// org-level preference controls whether it shows. Net width change:
// -226 + 280 = +54px (acceptable; old "Why now" was a single label
// while Signals is up to 3 chips with more density).
// 2026-05-31: added "Social" column (140px) between Signals and Revenue.
// New 15-col layout matches the per-account social_listener output —
// hover the count badge for the actual post excerpts (same
// pattern as the "Why it's here" Sparkles tooltip).
// 2026-06-09: added "Profile" column (100px) between Potential and Latest
// signal — composite cyber-profile score from account_profile_scorer.py.
// Net width change: +100 + 20 (gap) = +120.
// 2026-06-11: Social + Latest-signal columns folded into one hover-to-
// expand "Signals" column (the three were repeating each other).
// Signals widened 280→320; the other two tracks removed.
export const ACCOUNT_TABLE_COLS =
  "grid-cols-[280px_120px_170px_180px_110px_320px_100px_110px_100px_110px_120px_64px_220px_110px_110px_24px]";

// Sum of widths: 1958. Gaps (20px × 13): 260. Page padding: 40. Round up.
export const ACCOUNT_TABLE_MIN_W = "min-w-[2280px]";

// 2026-08-02: "Push" column (130px, after People) for orgs that can
// push accounts to connected apps (features.hubspot_push, demo).
// The send-to pill crowded the account-name cluster — own column.
// Column is flag-gated so every other org keeps the base 16-track grid.
const ACCOUNT_TABLE_COLS_PUSH =
  "grid-cols-[280px_120px_170px_180px_110px_130px_320px_100px_110px_100px_110px_120px_64px_220px_110px_110px_24px]";
const ACCOUNT_TABLE_MIN_W_PUSH = "min-w-[2430px]"; // +130 track +20 gap

/** Flag-aware track set — header, rows and skeleton must all use this
 * so the grid stays aligned whichever way the flag points. */
function useAccountTableTracks() {
  const { features } = useOrg();
  const { data: integrations } = useIntegrations();
  // canPush = a real destination exists (or the demo flag). The COLUMN now
  // renders for everyone (2026-08-16): unconnected orgs get a quiet
  // per-row "Connect" prompt into Integrations instead of dead space —
  // the empty state sells the feature rather than hiding it.
  const canPush =
    !!features.hubspot_push ||
    (integrations ?? []).some(
      (r) => r.provider === "hubspot" || r.provider === "slack",
    );
  return {
    pushCol: true,
    canPush,
    cols: ACCOUNT_TABLE_COLS_PUSH,
    minW: ACCOUNT_TABLE_MIN_W_PUSH,
  };
}

// ---------------------------------------------------------------------------
// Temperature
// ---------------------------------------------------------------------------

export function deriveTemperature(latestSignalAt: string | null): Temperature {
  if (!latestSignalAt) return "cold";
  const days =
    (Date.now() - new Date(latestSignalAt).getTime()) / (1000 * 60 * 60 * 24);
  if (days < 7) return "hot";
  if (days < 30) return "warm";
  return "cold";
}

// Temperature now renders as plain text + a small colour dot; the
// `pill` colour map was removed 2026-05-28 (no more pebbles).
const TEMP_STYLE: Record<Temperature, { dot: string; label: string }> = {
  hot: { dot: "bg-orange-400", label: "Hot" },
  warm: { dot: "bg-amber-400", label: "Warm" },
  cold: { dot: "bg-text-muted/60", label: "Cold" },
};

// INTENT_STYLE + CVE_TONE colour maps removed 2026-05-28 — the
// coloured pebbles in the table looked busy. Why now + CVEs render
// as plain text now; types still imported for the AccountRowData shape.

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

// Tone → Tailwind classes for the Signals chip. Map mirrors the tones
// defined in lib/dashboard/signalCategories.ts. Kept here (in the file
// that renders) so the chip styling is co-located with the row.
const CHIP_TONE_CLASSES: Record<AccountSignalChip["tone"], string> = {
  accent: "border-accent/30 bg-accent/10 text-accent",
  amber: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  rose: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  violet: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  blue: "border-blue-400/30 bg-blue-400/10 text-blue-300",
  muted: "border-border-default bg-bg-elevated text-text-secondary",
};

// ---------------------------------------------------------------------------
// Social signals cell — count badge + hover popover
// ---------------------------------------------------------------------------

// Same urgency ordering used in the account page SocialSignalsSection:
// breaches first (decision-altering), then leadership / funding /
// milestone (high-leverage congrats), operational signals next,
// references at the bottom.
const SOCIAL_TYPE_ORDINAL: Record<string, number> = {
  social_breach_mention: 0,
  social_leadership_change: 1,
  social_funding_news: 2,
  social_milestone: 3,
  social_employee_chatter: 4,
  social_company_post: 5,
  social_hiring_buzz: 6,
  social_vendor_relationship: 7,
  social_complaint: 8,
  social_customer_review: 9,
  social_company_mention: 10,
};

function SocialSignalsCell({
  signals,
}: {
  signals: SocialSignalSummary[];
}) {
  if (!signals || signals.length === 0) {
    return <span className="text-[12px] text-text-muted">—</span>;
  }

  // Sort by urgency-then-recency so the popover reads top-down by what
  // matters most. Caps shown sections at 8 to keep the popover scannable;
  // older signals are still accessible via the account page tab once we revive
  // it OR via the source links here.
  const sorted = [...signals].sort((a, b) => {
    const aOrd = SOCIAL_TYPE_ORDINAL[a.signal_type] ?? 99;
    const bOrd = SOCIAL_TYPE_ORDINAL[b.signal_type] ?? 99;
    if (aOrd !== bOrd) return aOrd - bOrd;
    return (b.detected_at || "").localeCompare(a.detected_at || "");
  });
  const visible = sorted.slice(0, 8);
  const overflow = signals.length - visible.length;

  const sections = visible.map((s) => {
    const label = SOCIAL_CHIP_LABELS[s.signal_type] ?? "Mention";
    return {
      title: `${label} · ${s.channel}`,
      body: s.summary || s.excerpt || "(no excerpt)",
    };
  });
  if (overflow > 0) {
    sections.push({
      title: "…and more",
      body: `${overflow} additional social signal${overflow === 1 ? "" : "s"} captured this period.`,
    });
  }

  return (
    <InfoTooltip
      placement="right"
      align="start"
      tone="highlight"
      eyebrow="Social signals"
      sections={sections}
      trigger={
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          aria-label={`${signals.length} social signal${signals.length === 1 ? "" : "s"} for this account`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border-default bg-bg-elevated px-2 py-1 text-[11.5px] text-text-secondary transition-colors hover:border-violet-400/40 hover:bg-violet-400/10 hover:text-violet-300"
        >
          <Radio size={11} strokeWidth={1.8} aria-hidden />
          <span className="font-mono tabular-nums">{signals.length}</span>
        </button>
      }
    />
  );
}

// Inline Monitor toggle (2026-06-11). Subtle pill on every account
// row for decoupled-monitoring orgs: "Monitor" on a Research account
// (click → promote to the live book), "Monitoring" once it's live
// (click → pause). Also the visible marker when an account auto-promotes
// after the rep unlocks a contact. Gated by the flag.
function MonitorToggle({ data }: { data: AccountRowData }) {
  const { features } = useOrg();
  const setMonitoring = useSetMonitoring();
  if (!features.decoupled_monitoring || !data.watchlist_id) return null;
  const active = data.monitoring_active;
  // Solo is caps-based — never mention credits to a Solo user.
  const isSolo = !!features.solo_plan;
  const title = active
    ? isSolo
      ? "Vera is watching this weekly — click to stop"
      : "Vera is watching this — click to stop (~4 credits/month)"
    : isSolo
      ? "Research only — click to have Vera watch it weekly"
      : "Research only — click to have Vera watch it (~4 credits/month)";
  return (
    <button
      type="button"
      disabled={setMonitoring.isPending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setMonitoring.mutate({ watchlistId: data.watchlist_id, active: !active });
      }}
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50",
        active
          ? "bg-accent/10 text-accent hover:bg-accent/20"
          : "border border-border-default text-text-muted hover:border-accent/40 hover:text-accent",
      )}
    >
      <Radar size={10} strokeWidth={2} />
      {active ? "Monitoring" : "Monitor"}
    </button>
  );
}

// Unified Signals cell (2026-06-11). Inline: the category chips.
// Hover: a popover listing the freshest signal headline + the social
// excerpts — folding the old "Social" and "Latest signal" columns into
// one so the three stop repeating each other. Same InfoTooltip dynamic
// the rep already likes on the Social count.
function SignalsCell({ data }: { data: AccountRowData }) {
  const chips = data.signal_chips;
  const sections: Array<{ title: string; body: string }> = [];

  if (data.latest_signal_headline) {
    sections.push({
      title: "Latest signal",
      body: scrubBackendNames(data.latest_signal_headline),
    });
  }
  for (const s of data.social_signals.slice(0, 6)) {
    const label = SOCIAL_CHIP_LABELS[s.signal_type] ?? "Social";
    sections.push({
      title: `${label} · ${s.channel}`,
      body: s.summary || s.excerpt || "(no excerpt)",
    });
  }

  const inline = (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {chips.length === 0 ? (
        <span className="text-[12px] text-text-muted">—</span>
      ) : (
        <>
          {chips.map((chip) => (
            <SignalChip key={chip.category} chip={chip} />
          ))}
          {data.signal_more > 0 && (
            <span className="rounded-full border border-border-default bg-bg-elevated px-2 py-0.5 font-mono text-[10px] text-text-muted">
              +{data.signal_more}
            </span>
          )}
        </>
      )}
    </div>
  );

  // No detail to expand → just the chips (or the em-dash).
  if (sections.length === 0) return inline;

  return (
    <InfoTooltip
      placement="right"
      align="start"
      tone="highlight"
      eyebrow="Signals"
      sections={sections}
      trigger={
        <div
          className="cursor-help"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {inline}
        </div>
      }
    />
  );
}

// The "+N" overflow indicator. Hovering reveals a small popover via
// the shared InfoTooltip primitive (named group, scoped to this badge
// — does NOT fire on whole-row hover even though the parent row is a
// Link with its own `group` class).
function MoreSignalsBadge({ count, labels }: { count: number; labels: string[] }) {
  if (labels.length === 0) {
    return (
      <span className="rounded-full border border-border-default bg-bg-elevated px-2 py-0.5 font-mono text-[10px] text-text-muted">
        +{count}
      </span>
    );
  }
  return (
    <InfoTooltip
      eyebrow="Also detected"
      title={labels.join(" · ")}
      trigger={
        <span
          className="rounded-full border border-border-default bg-bg-elevated px-2 py-0.5 font-mono text-[10px] text-text-muted"
          // Stop the row click from firing when the user clicks the
          // badge (some users will try to "click for detail").
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          +{count}
        </span>
      }
    />
  );
}

// Per-account reasons surfaced when the rep hovers the company name.
// Up to 3 short statements, each tailored to the row's actual data
// (score, signals, CVEs). No two accounts get the same card. Vera
// voice: factual, no salesy "Strong match!" framing — just what's
// true for THIS account so the rep knows why it's worth their time.
function deriveAccountReasons(
  data: AccountRowData,
): Array<{ title: string; body: string }> {
  const reasons: Array<{ title: string; body: string }> = [];

  // 1. Score-driven match summary. Always shown — anchors the card.
  if (data.score >= 70) {
    reasons.push({
      title: `Strong match · ${data.score}/100`,
      body: "High signal density and recency — worth prioritising.",
    });
  } else if (data.score >= 40) {
    reasons.push({
      title: `Active account · ${data.score}/100`,
      body: "Moderate activity — worth a look.",
    });
  } else if (data.score > 0) {
    reasons.push({
      title: `On watch · ${data.score}/100`,
      body: "Quiet right now but tracked for changes.",
    });
  } else {
    reasons.push({
      title: "On watch · no recent activity",
      body: "We'll surface anything new on the next monitor pass.",
    });
  }

  // 2. Pull up to 2 reasons from the top chips (highest-priority
  //    categories — see signalCategories.ts sortPriority). Each chip
  //    category has its own factual body line.
  for (const chip of data.signal_chips.slice(0, 2)) {
    const body = REASON_BODY_BY_CATEGORY[chip.category];
    if (!body) continue;
    // Don't duplicate the score line's framing.
    const countSuffix = chip.count > 1 ? ` · ${chip.count}` : "";
    reasons.push({
      title: `${REASON_TITLE_BY_CATEGORY[chip.category] ?? chip.label}${countSuffix}`,
      body,
    });
    if (reasons.length >= 3) break;
  }

  return reasons.slice(0, 3);
}

// Friendly titles + bodies per signal category. Title = short headline,
// body = one factual sentence on what it means in practice. Stays
// neutral on cyber-defensive categories per the no-ambulance-chasing
// rule (the rep uses this as context; outreach framing is separate).
const REASON_TITLE_BY_CATEGORY: Record<string, string> = {
  security_leadership: "New security leadership",
  leadership_change: "Leadership change",
  funding: "Recently funded",
  acquisition: "Recent M&A activity",
  partnership: "New strategic partnership",
  expansion: "Recent office expansion",
  product_launch: "Recent product launch",
  hiring: "Active hiring",
  cyber_job_intent: "Cyber tooling in job posts",
  cve_exposure: "CVE exposure in stack",
  breach: "Breach activity",
  tech_change: "Tech stack change",
  security_posture: "Security posture signal",
  enterprise_readiness: "Enterprise readiness signal",
  company_news: "Recent company news",
  person_activity: "Contact activity",
  social_chatter: "Social conversation",
};

const REASON_BODY_BY_CATEGORY: Record<string, string> = {
  security_leadership:
    "Fresh decision-maker in the security stack — vendor reviews often follow.",
  leadership_change:
    "New voice in the room — strategic vendor decisions can shift.",
  funding:
    "Fresh capital — security maturity push often follows.",
  acquisition:
    "Post-deal integration — security stack often consolidated.",
  partnership:
    "New strategic relationship — extends what the account cares about.",
  expansion:
    "Growing footprint — operations scaling triggers new buying.",
  product_launch:
    "New revenue surface — context for how their stack is evolving.",
  hiring:
    "Team scaling — budgets are open, roles are being defined.",
  cyber_job_intent:
    "Job posts reference specific cyber tools or workflows — strong buying intent.",
  cve_exposure:
    "Known vulnerabilities in their detected stack — useful for sector context.",
  breach:
    "Recent breach activity — peer or direct.",
  tech_change:
    "Tech stack shifting — vendor swaps in motion.",
  security_posture:
    "Public security posture signal — useful for fit assessment.",
  enterprise_readiness:
    "Signals around upmarket / enterprise customers — buying maturity.",
  company_news:
    "Generic news activity in the last 90 days.",
  person_activity:
    "Tracked contacts active on LinkedIn or relevant topics.",
};

function SignalChip({ chip }: { chip: AccountSignalChip }) {
  return (
    <span
      title={chip.title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-[0.06em]",
        CHIP_TONE_CLASSES[chip.tone],
      )}
    >
      {chip.label}
      {chip.count > 1 && (
        <span className="opacity-70">·{chip.count}</span>
      )}
    </span>
  );
}

function CompanyLogo({ domain, name }: { domain: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const initial = (name || domain).trim().charAt(0).toUpperCase() || "?";
  if (failed) {
    return (
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border-default bg-bg-elevated font-display text-[12px] font-medium text-text-secondary">
        {initial}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl(domain, 128)}
      alt={`${name} logo`}
      width={32}
      height={32}
      onError={() => setFailed(true)}
      className="h-8 w-8 shrink-0 rounded-md border border-border-subtle bg-white object-contain p-1"
    />
  );
}

// ---------------------------------------------------------------------------
// Sticky-column helpers — keep the bg color in lockstep with row hover so
// the frozen Account cell looks continuous with the rest of the row.
// ---------------------------------------------------------------------------

// Sticky cell baseline (sits above other cells when scrolled horizontally)
// Sticky cell paints its own background so the row's solid bg doesn't
// scroll under it. The hover tint MUST be opaque — translucent (e.g.
// bg-accent/[0.04]) lets the scrolling non-sticky cells become visible
// through the sticky cell. color-mix() at
// 4% gives the same visual as the translucent accent tint, but solid.
//
// group-hover:z-30 bumps the hovered row's sticky cell ABOVE the next
// rows' sticky cells. Without it, any popover rendered inside the
// sticky cell (the "Why it's here" Sparkles tooltip) is trapped at the
// row's z-10 — later rows' sticky cells (also z-10) paint over it in
// DOM order, making the popover look transparent / behind the next
// rows' company names. With z-30 on hover,
// the active row sits cleanly above all neighbours.
// self-stretch makes the frozen Account cell fill the full row height
// (the row grid is items-center, so without this the cell is only as
// tall as its own content and taller neighbours' text scrolls through
// the gap above/below it — the "messy bleed").
const STICKY_CELL =
  "sticky left-0 z-10 self-stretch group-hover:z-30 bg-bg-card group-hover:bg-[color-mix(in_srgb,var(--accent)_4%,var(--bg-card))] transition-colors";

// Subtle right edge so the frozen column has a visible boundary when scrolled
const STICKY_EDGE = "shadow-[1px_0_0_0_var(--color-border-default,#1f1f23)]";

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

export function AccountRow({
  data,
  onOpenPeople,
  onOpen,
}: {
  data: AccountRowData;
  /** Click-handler for the People drawer (the small "View people"
   * button inside the row). Stops propagation so it doesn't trigger
   * the whole-row click. */
  onOpenPeople?: (args: { domain: string; name: string }) => void;
  /** Whole-row click — opens the account preview drawer. Falls back
   * to a noop when undefined (legacy / demo pages that don't wire
   * the drawer). */
  onOpen?: (data: AccountRowData) => void;
}) {
  const temp = deriveTemperature(data.latest_signal_at);
  const ts = TEMP_STYLE[temp];
  const tracks = useAccountTableTracks();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(data)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen?.(data);
        }
      }}
      className="group block w-full cursor-pointer text-left transition-colors hover:bg-accent/[0.04] focus:bg-accent/[0.04] focus:outline-none"
      aria-label={`Open ${data.name}`}
    >
      {/* Desktop: full wide table */}
      <div
        className={cn(
          "hidden items-center gap-x-5 border-b border-border-subtle py-1.5 pl-5 pr-5 md:grid",
          tracks.cols,
          tracks.minW,
        )}
      >
        {/* 1. Account (STICKY) */}
        <div
          className={cn(
            "flex min-w-0 items-center gap-2.5 -my-1.5 py-1.5 -ml-5 pl-5 pr-3",
            STICKY_CELL,
            STICKY_EDGE,
          )}
        >
          <CompanyLogo domain={data.domain} name={data.name} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate font-display text-[14.5px] font-medium text-text-primary">
                {data.name}
              </span>
              {/* External link affordances — small, muted, click-through
                  doesn't navigate the row (e.preventDefault stops the
                  parent Link from firing). */}
              <a
                href={`https://${data.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={`Open ${data.domain}`}
                aria-label={`Open ${data.domain} website`}
                className="shrink-0 rounded p-0.5 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-secondary"
              >
                <Globe size={11} strokeWidth={1.8} />
              </a>
              {data.linkedin_url && (
                <a
                  href={data.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title={`Open ${data.name} on LinkedIn`}
                  aria-label={`Open ${data.name} on LinkedIn`}
                  className="shrink-0 rounded p-0.5 text-text-muted transition-colors hover:bg-bg-elevated hover:text-[#0a66c2]"
                >
                  <LinkedinMark size={11} />
                </a>
              )}
              {/* Dedicated "why" trigger — hover reveals the multi-
                  section reassurance card. Discrete sparkle icon so
                  it doesn't compete visually with the company name,
                  but always present so every row has a "why" surface.
                  Violet glow on the popover makes the hover feel like
                  a deliberate moment. */}
              <InfoTooltip
                placement="right"
                tone="highlight"
                eyebrow="Why it's here"
                sections={deriveAccountReasons(data)}
                trigger={
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    aria-label={`Why ${data.name} is on your radar`}
                    className="shrink-0 rounded p-0.5 text-text-muted transition-colors hover:bg-violet-400/10 hover:text-violet-400"
                  >
                    <Sparkles size={11} strokeWidth={1.8} />
                  </button>
                }
              />
              <MonitorToggle data={data} />
            </div>
            <div className="truncate text-[12px] text-text-muted">
              {data.industry ? (
                <>
                  <span className="text-text-secondary">{humanizeLabel(data.industry)}</span>
                  <span className="px-1">·</span>
                </>
              ) : null}
              <span className="font-mono">{data.domain}</span>
            </div>
          </div>
        </div>

        {/* 2. Temp — plain text + colour dot + numeric score for users
            who want to scan the underlying intent number. */}
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 text-[12px] text-text-secondary">
            <span
              className={cn("h-1.5 w-1.5 rounded-full", ts.dot)}
              aria-hidden
            />
            {ts.label}
            <span className="font-mono text-[11px] text-text-muted">
              {data.score}
            </span>
          </span>
        </div>

        {/* 3. Signal wave */}
        <div className="min-w-0">
          <SignalWave data={data.viz} />
        </div>

        {/* Key Contact — named security decision-maker. Hover opens a clean
            popover with their title and email (when we have it). */}
        <div className="min-w-0">
          {data.security_contact ? (
            <InfoTooltip
              placement="right"
              eyebrow="Key contact"
              sections={[
                {
                  title: data.security_contact.name,
                  body: data.security_contact.title || "Security leadership",
                },
                data.security_contact.discovered
                  ? {
                      title: "Discovered",
                      body: "Open the account and unlock to reveal contact details.",
                    }
                  : data.security_contact.email
                    ? { title: "Email", body: data.security_contact.email }
                    : { title: "Identified", body: "Contact surfaced from your leads." },
              ]}
              trigger={
                <span
                  className={cn(
                    "inline-flex min-w-0 max-w-full cursor-default items-center gap-1.5 truncate text-[12px]",
                    data.security_contact.discovered ? "text-text-muted" : "text-text-secondary",
                  )}
                >
                  {data.security_contact.discovered ? (
                    <Lock size={10} strokeWidth={2} className="shrink-0 text-text-muted" aria-hidden />
                  ) : (
                    <ShieldCheck size={11} strokeWidth={2} className="shrink-0 text-accent" aria-hidden />
                  )}
                  <span className="truncate">{data.security_contact.name}</span>
                </span>
              }
            />
          ) : (
            <span className="text-text-muted">—</span>
          )}
        </div>

        {/* 4. People — Surfe-style "view employees" drawer. High-value
            affordance kept up-front rather than buried at the right edge. */}
        <div className="min-w-0">
          {onOpenPeople ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenPeople({ domain: data.domain, name: data.name });
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-2 py-1 text-[11.5px] text-text-secondary transition-colors hover:border-accent/40 hover:bg-bg-elevated hover:text-text-primary"
              aria-label={`View people at ${data.name}`}
            >
              <Users size={11} aria-hidden />
              View people
            </button>
          ) : (
            "—"
          )}
        </div>

        {/* 4b. Push — send the account to connected apps (own column;
            the pill crowded the name cluster). With no
            destination connected, the slot prompts into Integrations
            instead of sitting blank. */}
        {tracks.pushCol && (
          <div className="min-w-0">
            {tracks.canPush ? (
              <SendToButton id={data.domain} entity="company" variant="pill" />
            ) : (
              <Link
                href="/dashboard/integrations"
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border-strong px-3 py-1 text-[11.5px] font-medium text-text-muted transition-colors hover:border-accent/50 hover:text-accent"
              >
                <Plug size={11} aria-hidden />
                Connect
              </Link>
            )}
          </div>
        )}

        {/* 5. Signals — category chips + hover-to-expand popover that
            lists the freshest headline and the social excerpts. Folds
            the old "Social" and "Latest signal" columns into one
            (2026-06-11): same hover dynamic, no repetition. */}
        <div className="min-w-0">
          <SignalsCell data={data} />
        </div>

        {/* 6. Revenue */}
        <div className="min-w-0 truncate text-[12px] text-text-secondary">
          {data.revenue ?? <span className="text-text-muted">—</span>}
        </div>

        {/* 7. Est. deal value — derived per-account from client's deal economics */}
        <div
          className="min-w-0 truncate font-mono text-[12px] text-text-secondary"
          title={
            data.potential
              ? "Estimated deal value for you — your average deal size weighted by how well this account fits"
              : "Add your average deal size in Settings to estimate deal value"
          }
        >
          {data.potential ?? <span className="text-text-muted">Set deal size</span>}
        </div>

        {/* 7b. Profile — composite cyber-profile score (0-100) */}
        <div className="min-w-0">
          {data.profile_composite !== null ? (
            <ProfileScoreCell value={data.profile_composite} />
          ) : (
            <span className="text-text-muted">—</span>
          )}
        </div>

        {/* 7c. Open cyber/GRC vacancies on the account's own job board */}
        <div className="min-w-0 text-[12.5px] text-text-secondary">
          {data.security_jobs ?? <span className="text-text-muted">—</span>}
        </div>

        {/* Country — with flag prefix when we can map the country name. */}
        <div className="min-w-0 truncate text-[12.5px] text-text-secondary">
          {data.country ? (
            <span className="inline-flex items-center gap-1.5">
              {countryFlag(data.country) && (
                <span aria-hidden className="text-[14px] leading-none">
                  {countryFlag(data.country)}
                </span>
              )}
              <span className="truncate">{data.country}</span>
            </span>
          ) : (
            <span className="text-text-muted">—</span>
          )}
        </div>

        {/* 8. Size */}
        <div className="min-w-0 truncate font-mono text-[12px] text-text-secondary">
          {formatSizeBand(data.size_band) ?? <span className="text-text-muted">—</span>}
        </div>

        {/* 9. Stack */}
        <div className="min-w-0">
          {data.stack.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {data.stack.slice(0, 4).map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center rounded-full border border-border-default bg-bg-elevated px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] text-text-secondary"
                >
                  {s}
                </span>
              ))}
              {data.stack.length > 4 && (
                <span className="self-center text-[11px] text-text-muted">
                  +{data.stack.length - 4}
                </span>
              )}
            </div>
          ) : (
            <span className="text-[11.5px] text-text-muted">—</span>
          )}
        </div>

        {/* 10. Watching since */}
        <div className="min-w-0 text-[11.5px] text-text-muted">
          {data.watching_since ? (
            <RelativeTime value={data.watching_since} />
          ) : (
            "—"
          )}
        </div>

        {/* 11. Last checked (weekly monitor pass) */}
        <div className="min-w-0 text-[11.5px] text-text-muted">
          {data.last_checked_at ? (
            <RelativeTime value={data.last_checked_at} />
          ) : (
            "—"
          )}
        </div>

        {/* 12. Chevron */}
        <ArrowUpRight
          size={15}
          className="shrink-0 text-text-muted transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-text-primary"
          aria-hidden
        />
      </div>

      {/* Mobile: 2-line condensed */}
      <div className="flex flex-col gap-2 border-b border-border-subtle px-5 py-3 md:hidden">
        <div className="flex items-center gap-2.5">
          <CompanyLogo domain={data.domain} name={data.name} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[14.5px] font-medium text-text-primary">
              {data.name}
            </div>
            <div className="truncate font-mono text-[10.5px] text-text-muted">
              {data.domain}
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] text-text-secondary">
            <span
              className={cn("h-1.5 w-1.5 rounded-full", ts.dot)}
              aria-hidden
            />
            {ts.label}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          {data.intent ? (
            <span className="text-[12px] text-text-secondary">{data.intent.label}</span>
          ) : (
            <span className="text-[11.5px] text-text-muted">—</span>
          )}
        </div>
        {data.latest_signal_headline && (
          <div className="line-clamp-1 text-[12px] text-text-secondary">
            {scrubBackendNames(data.latest_signal_headline)}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header — sticky first cell mirrors the row's frozen column
// ---------------------------------------------------------------------------

export function AccountTableHeader() {
  const tracks = useAccountTableTracks();
  return (
    <div
      className={cn(
        "hidden items-center gap-x-5 border-b border-border-default py-1.5 pl-5 pr-5 text-[12px] text-text-muted md:grid",
        tracks.cols,
        tracks.minW,
      )}
    >
      <div
        className={cn(
          "-my-1.5 -ml-5 py-1.5 pl-5 pr-3",
          "sticky left-0 z-10 bg-bg-card",
          STICKY_EDGE,
        )}
      >
        Account
      </div>
      <div>Temp · Score</div>
      <div>Activity · 90d</div>
      <div>Key Contact</div>
      <div>People</div>
      {tracks.pushCol && <div>Push</div>}
      <div>Signals</div>
      <div>Revenue</div>
      <div className="whitespace-nowrap">Est. deal value</div>
      <div>Profile</div>
      <div>Number of security jobs</div>
      <div>Country</div>
      <div>Size</div>
      <div>Stack</div>
      <div>Watching</div>
      <div>Last checked</div>
      <div />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile cell — compact composite-score render. Mini horizontal bar +
// monospace number. Colour ramps muted → blue → emerald as the score
// rises so the column reads like a tiny heatmap when reps scan down it.
// Full breakdown lives on the dossier; here we just show the number.
// ---------------------------------------------------------------------------
function ProfileScoreCell({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const fill =
    clamped >= 70
      ? "bg-emerald-500/70"
      : clamped >= 45
        ? "bg-sky-500/70"
        : clamped >= 20
          ? "bg-amber-500/60"
          : "bg-rose-500/60";
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[12.5px] tabular-nums text-text-primary">
        {clamped}
        <span className="text-text-muted">/100</span>
      </span>
      <div className="h-1 flex-1 rounded-full bg-bg-elevated overflow-hidden">
        <div
          className={cn("h-full transition-all", fill)}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export function AccountRowSkeleton() {
  const tracks = useAccountTableTracks();
  return (
    <div
      className={cn(
        "hidden items-center gap-x-5 border-b border-border-subtle py-1.5 pl-5 pr-5 md:grid",
        tracks.cols,
        tracks.minW,
      )}
      aria-hidden
    >
      <div
        className={cn(
          "-my-1.5 -ml-5 flex items-center gap-2.5 py-1.5 pl-5 pr-3",
          "sticky left-0 z-10 bg-bg-card",
          STICKY_EDGE,
        )}
      >
        <div className="h-8 w-8 rounded-md bg-text-muted/10" />
        <div className="min-w-0 flex-1">
          <div className="h-3 w-32 rounded bg-text-muted/15" />
          <div className="mt-0.5 h-2.5 w-40 rounded bg-text-muted/10" />
        </div>
      </div>
      <div className="h-4 w-20 rounded-full bg-text-muted/10" />
      <div className="h-9 w-40 rounded-md bg-text-muted/10" />
      <div className="h-3 w-28 rounded bg-text-muted/10" />
      <div className="h-7 w-24 rounded-md bg-text-muted/10" />
      {tracks.pushCol && <div className="h-4 w-16 rounded-md bg-text-muted/10" />}
      <div className="flex gap-1.5">
        <div className="h-4 w-14 rounded-full bg-text-muted/10" />
        <div className="h-4 w-14 rounded-full bg-text-muted/10" />
        <div className="h-4 w-14 rounded-full bg-text-muted/10" />
      </div>
      {/* Revenue + Potential */}
      <div className="h-2.5 w-16 rounded bg-text-muted/10" />
      <div className="h-4 w-14 rounded-md bg-text-muted/10" />
      {/* Profile cell skeleton */}
      <div className="h-4 w-10 rounded-md bg-text-muted/10" />
      <div className="h-2.5 w-20 rounded bg-text-muted/10" />
      <div className="flex gap-1.5">
        <div className="h-4 w-14 rounded-full bg-text-muted/10" />
        <div className="h-4 w-12 rounded-full bg-text-muted/10" />
      </div>
      <div className="h-2.5 w-16 rounded bg-text-muted/10" />
      <div className="h-2.5 w-16 rounded bg-text-muted/10" />
      <div className="h-4 w-4 rounded bg-text-muted/10" />
    </div>
  );
}
