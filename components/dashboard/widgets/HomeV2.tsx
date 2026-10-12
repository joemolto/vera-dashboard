"use client";

/**
 * HomeV2 — home layout, Vera-shaped throughout.
 *
 * Outreach-style dashboards lead with labels like Leads Engaged,
 * Conversations, Replies. Vera is intelligence-not-outreach, so every
 * metric was re-derived:
 *
 *   Welcome banner with time filter (7d / 30d / 3mo / This month)
 *     ↓
 *   4 KPI cards: Hot accounts · Signals · Suggestions pending · Revenue potential
 *     ↓
 *   Signal activity chart (signals per day over the chosen window)
 *     ↓
 *   2-up bottom: Hottest accounts | What's new today (the existing UnifiedTimeline)
 *
 * Gated per-org via features.home_v2. Orgs without the flag keep the
 * VeraBrief + ActOnToday + UnifiedTimeline layout.
 */

import { EV, track } from "@/lib/analytics";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  Banknote,
  Building2,
  DollarSign,
  Euro,
  Flame,
  PoundSterling,
  ShieldAlert,
  Sparkles,
  User,
  UserCog,
  UserPlus,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Card, SectionHeader, Shimmer } from "@/components/dashboard/primitives";
import { useOrg } from "@/components/dashboard/OrgContext";
import { useStatBundle } from "@/components/dashboard/widgets/homeStatCards";
import { CountUp } from "@/components/dashboard/CountUp";
import { formatPotential } from "@/lib/dashboard/accountRevenuePotential";
import { buyingTriggerSetFor } from "@/lib/dashboard/buyingTriggers";
import { signalTypeLabel } from "@/lib/dashboard/labels";
import { WhoToContactToday } from "@/components/dashboard/widgets/WhoToContactToday";
import {
  useAccountScores,
  useSignals,
  useSoloLimits,
  useWatchlist,
} from "@/lib/dashboard/queries";
import { scrubBackendNames } from "@/lib/dashboard/labels";
import { isStaleByHeadline } from "@/lib/dashboard/signalFreshness";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useLeads } from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";
import { SELF_HOSTED } from "@/lib/selfHosted";
import { logoUrl } from "@/lib/logoUrl";


export function HomeV2() {
  const { firstName } = useOrg();

  // One fixed layout (2026-07-19: configurability scrapped). Numbers
  // lead, chart + worklist pair beneath, accounts moving closes.
  return (
    <div className="mx-auto flex w-full max-w-[1536px] flex-col gap-4 px-5 py-6 md:gap-5 md:px-7 md:py-7">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="min-w-0 font-display text-[1.25rem] font-medium leading-snug tracking-tight text-text-primary">
          Welcome{firstName ? `, ${firstName}` : ""}.
        </h1>
        <StatusPills />
      </div>

      <KpiRow />

      <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-2">
        <AccountsMoving />
        <WhoToContactToday />
      </div>

      <SignalActivityCard />
    </div>
  );
}

/** One metric card in the reference style: icon chip, quiet label, the
 *  number as the loudest thing on the card. */
function Metric({
  label,
  value,
  sub,
  href,
  Icon,
  lead = false,
  badge,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  href: string;
  Icon: LucideIcon;
  lead?: boolean;
  badge?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex h-full flex-col rounded-2xl border border-border-default bg-bg-card p-4 shadow-theme-xs transition-colors hover:border-border-strong"
    >
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg",
          lead
            ? "bg-brand-50 text-brand-500 dark:bg-brand-500/[0.12] dark:text-brand-400"
            : "bg-bg-elevated text-text-secondary",
        )}
      >
        <Icon size={16} strokeWidth={1.8} />
      </div>
      <div className="mt-3.5 flex flex-1 items-end justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[12px] text-text-muted">{label}</span>
          <h4 className="mt-1 truncate text-[21px] font-semibold leading-tight tracking-tight text-text-primary">
            {value}
          </h4>
          {sub && (
            <span className="mt-0.5 block text-[11px] leading-snug text-text-muted">
              {sub}
            </span>
          )}
        </div>
        {badge}
      </div>
    </Link>
  );
}

/** Money-card icon that matches the org's currency, so a $ value never sits
 *  under a £ glyph (and vice versa). */
function currencyIcon(currency: string | undefined): LucideIcon {
  const c = (currency ?? "GBP").toUpperCase();
  if (c === "EUR") return Euro;
  if (c === "GBP") return PoundSterling;
  return DollarSign; // USD / CAD / AUD and any other $-denominated currency
}

/** The stat row — four fixed numbers, money first, then the research tile. */
function KpiRow() {
  const b = useStatBundle();
  const money = (v: number) => formatPotential(v, b.baseline?.currency ?? "GBP");
  const noDeal = "set your average deal size in Settings";
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-5 xl:grid-cols-5">
      <Metric
        label="Pipeline potential"
        value={b.pipeline ? <CountUp to={b.pipeline.total} format={money} /> : "—"}
        sub={
          b.pipeline
            ? `across ${b.pipeline.accounts} watched account${b.pipeline.accounts === 1 ? "" : "s"}`
            : noDeal
        }
        href={b.pipeline ? "/dashboard/accounts" : "/dashboard/settings"}
        Icon={currencyIcon(b.baseline?.currency)}
        lead
      />
      <Metric
        label="Hot pipeline"
        value={b.hotPipeline !== null ? <CountUp to={b.hotPipeline} format={money} /> : "—"}
        sub={b.hotPipeline !== null ? "moving in the last 7 days" : noDeal}
        href={b.hotPipeline !== null ? "/dashboard/accounts" : "/dashboard/settings"}
        Icon={Flame}
      />
      <Metric
        label="Top opportunity"
        value={b.topOpportunity ? <CountUp to={b.topOpportunity.estimate} format={money} /> : "—"}
        sub={
          b.topOpportunity
            ? b.topOpportunity.name
            : b.pipeline
              ? "no account is moving right now"
              : noDeal
        }
        href={
          b.topOpportunity || b.pipeline
            ? "/dashboard/accounts"
            : "/dashboard/settings"
        }
        Icon={Zap}
      />
      <Metric
        label="Hot accounts"
        value={<CountUp to={b.hotAccounts} />}
        sub="signals in the last 7 days"
        href="/dashboard/accounts"
        Icon={Building2}
      />
      <Metric
        label="Signals this week"
        value={<CountUp to={b.signalsWeek} />}
        href="/dashboard/feed"
        Icon={Activity}
        badge={
          b.signalsWeekDelta !== null ? (
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-medium",
                b.signalsWeekDelta >= 0
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-red-500/10 text-red-600 dark:text-red-400",
              )}
            >
              {b.signalsWeekDelta >= 0 ? "+" : ""}
              {b.signalsWeekDelta}%
            </span>
          ) : undefined
        }
      />
    </div>
  );
}

/** The signal-activity chart, back as a proper card (the references pair
 *  every stat row with one real chart). Window toggle lives in the card
 *  header and touches nothing else on the page. */
function SignalActivityCard() {
  const { data: signals, isLoading } = useSignals();
  const [days, setDays] = useState<7 | 30 | 90>(30);

  const data = useMemo(() => {
    const buckets = new Map<string, number>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(Date.now() - (days - 1) * 86_400_000);
    start.setHours(0, 0, 0, 0);
    const cursor = new Date(start);
    while (cursor <= today) {
      buckets.set(cursor.toISOString().slice(0, 10), 0);
      cursor.setDate(cursor.getDate() + 1);
    }
    for (const s of signals ?? []) {
      if (!s.detected_at) continue;
      const t = new Date(s.detected_at).getTime();
      if (t < start.getTime()) continue;
      const key = new Date(t).toISOString().slice(0, 10);
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return Array.from(buckets.entries()).map(([date, count]) => ({
      label: new Date(date).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      }),
      count,
    }));
  }, [signals, days]);

  const toggle = (active: boolean) =>
    cn(
      "rounded-full px-2.5 py-0.5 text-[11.5px] transition-colors",
      active
        ? "bg-bg-elevated text-text-primary"
        : "text-text-muted hover:text-text-secondary",
    );

  return (
    <Card delay={0.05} className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 p-5 pb-2">
        <SectionHeader title="Signal activity" />
        <div className="inline-flex items-center gap-0.5 rounded-full border border-border-subtle p-0.5">
          {([7, 30, 90] as const).map((d) => (
            <button key={d} type="button" className={toggle(days === d)} onClick={() => setDays(d)}>
              {d}d
            </button>
          ))}
        </div>
      </div>
      <div className="h-[280px] px-2 pb-4 md:px-3">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-[12px] text-text-muted">
            Loading…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id="signalGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#574FD6" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#574FD6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(128 128 148 / 0.12)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10.5, fill: "rgb(140 140 158)" }}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10.5, fill: "rgb(140 140 158)" }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip
                contentStyle={{
                  background: "rgb(20 20 28)",
                  border: "1px solid rgb(50 50 65)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "rgb(220 220 230)" }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#574FD6"
                strokeWidth={1.8}
                fill="url(#signalGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

function relTime(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60_000);
  if (m < 60) return `${Math.max(m, 1)}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function StatusPills() {
  const { features } = useOrg();
  const { data: watchlist } = useWatchlist();
  const { data: limits } = useSoloLimits(!SELF_HOSTED && !!features.solo_plan);
  const monitored = watchlist?.length ?? 0;

  // Monitoring freshness — evidence, not a label. The daily sweep means a
  // healthy system always has a check inside 48h (per-account cadence is
  // 2d/7d/30d by heat, so "every account within 24h" is never true).
  // Green "Vera is live" while that holds; amber with the real age only
  // when monitoring has genuinely gone silent.
  const { active, lastCheck } = useMemo(() => {
    let active = 0;
    let lastCheck = 0;
    for (const w of watchlist ?? []) {
      if (w.monitoring_active === false) continue;
      active += 1;
      const t = w.last_monitored_at
        ? new Date(w.last_monitored_at).getTime()
        : 0;
      if (t > lastCheck) lastCheck = t;
    }
    return { active, lastCheck };
  }, [watchlist]);
  const live = lastCheck >= Date.now() - 48 * 60 * 60 * 1000;

  const pill =
    "inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-bg-card px-2.5 py-1 text-[11.5px] text-text-secondary";
  return (
    <div className="inline-flex flex-wrap items-center gap-1.5">
      <span className={pill}>
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        {/* Numerator is the live watchlist, not the engine's caps
            counter — the two can disagree (an older watchlist predates caps
            and its counter reads 0). The engine only supplies the cap. */}
        {!SELF_HOSTED && limits?.limits.accounts
          ? `${monitored} of ${limits.limits.accounts} accounts monitored`
          : `${monitored} account${monitored === 1 ? "" : "s"} monitored`}
      </span>
      {active > 0 && (
        <span className={pill}>
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              live
                ? "bg-emerald-500"
                : lastCheck
                  ? "bg-amber-500"
                  : "bg-border-strong",
            )}
          />
          {live
            ? "Vera is live"
            : lastCheck
              ? `Last check ${relTime(lastCheck)}`
              : "First check queued"}
        </span>
      )}
    </div>
  );
}

function CompanyFavicon({ domain, name }: { domain: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !domain) {
    return (
      <div className="grid h-6 w-6 shrink-0 place-items-center rounded border border-border-subtle bg-bg-elevated text-[11px] font-medium uppercase text-text-secondary">
        {(name || domain || "?").charAt(0)}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl(domain, 128)}
      alt=""
      width={24}
      height={24}
      className="h-6 w-6 shrink-0 rounded border border-border-subtle bg-white object-contain p-0.5"
      onError={() => setFailed(true)}
    />
  );
}

// ---------------------------------------------------------------------------
// "Accounts moving" — Today's hot accounts merged with the 30-day heat rank (2026-06-08).
//
// What it's NOT: a 40-row noisy feed of random Reddit mentions and
// passing partnership news. Reps don't care that we collected 700+
// signals — they care WHICH 5 accounts to act on.
//
// What it IS: ≤5 accounts. One row per account (collapse multiple
// signals to the strongest). Each row labels the trigger TYPE
// (Breach / New leadership / Funding / Security hiring / Person
// engaged with competitor) — that's what makes the rep pick up
// the phone, not the raw headline text.
//
// STRICT whitelist of buying-trigger signal types only — everything
// else (social mentions, partnerships, product launches, etc.)
// stays in the engine for research depth but doesn't reach the
// home page.
// ---------------------------------------------------------------------------

const TODAYS_HOT_MAX = 15; // ~4 visible, rest scroll
const TODAYS_HOT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface TriggerCategory {
  bucket: "breach" | "leadership" | "funding" | "hiring" | "person";
  label: string;
  priority: number; // higher = wins per-account dedupe + appears higher in list
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  tone: string; // Tailwind classes for the chip
}

const TYPE_TO_CATEGORY: Record<string, TriggerCategory> = {
  // Credential exposure (stealer logs / dark web) — the strongest live-risk
  // opener for a cyber seller; tops the per-account dedupe.
  credential_leak: {
    bucket: "breach",
    label: "Credentials in stealer logs",
    priority: 110,
    icon: ShieldAlert,
    tone: "border-red-400/40 bg-red-400/10 text-red-300",
  },
  credential_leak_supply_chain: {
    bucket: "breach",
    label: "Supply-chain credential exposure",
    priority: 72,
    icon: ShieldAlert,
    tone: "border-red-400/40 bg-red-400/10 text-red-300",
  },
  // Breach (highest urgency — peer-hit or named-in-news)
  social_breach_mention: {
    bucket: "breach",
    label: "Breach mention",
    priority: 95,
    icon: ShieldAlert,
    tone: "border-red-400/40 bg-red-400/10 text-red-300",
  },
  breach_proximity: {
    bucket: "breach",
    label: "Peer breach",
    priority: 85,
    icon: ShieldAlert,
    tone: "border-red-400/40 bg-red-400/10 text-red-300",
  },
  // Leadership (new in seat = vendor-review window)
  security_leadership_hire: {
    bucket: "leadership",
    label: "New security leader",
    priority: 100,
    icon: UserCog,
    tone: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  },
  social_leadership_change: {
    bucket: "leadership",
    label: "Leadership change",
    priority: 80,
    icon: UserCog,
    tone: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  },
  new_leadership: {
    bucket: "leadership",
    label: "New leadership",
    priority: 75,
    icon: UserCog,
    tone: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  },
  // Funding / M&A (budget unlock)
  recently_funded: {
    bucket: "funding",
    label: "Funding round",
    priority: 80,
    icon: Banknote,
    tone: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  },
  social_funding_news: {
    bucket: "funding",
    label: "Funding news",
    priority: 75,
    icon: Banknote,
    tone: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  },
  recent_acquisition: {
    bucket: "funding",
    label: "Acquisition",
    priority: 65,
    icon: Banknote,
    tone: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  },
  // Security hiring (building capacity → needs vendor tooling)
  security_team_expansion: {
    bucket: "hiring",
    label: "Security team scaling",
    priority: 80,
    icon: UserPlus,
    tone: "border-violet-400/40 bg-violet-400/10 text-violet-300",
  },
  hiring_security: {
    bucket: "hiring",
    label: "Security hiring",
    priority: 75,
    icon: UserPlus,
    tone: "border-violet-400/40 bg-violet-400/10 text-violet-300",
  },
  // Person-level intel (when person_intel is enabled on the account)
  person_engaged_with_competitor: {
    bucket: "person",
    label: "Engaged with competitor",
    priority: 105, // strongest single signal — beats everything else
    icon: User,
    tone: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  },
  person_new_in_role: {
    bucket: "person",
    label: "Buyer new in role",
    priority: 95,
    icon: User,
    tone: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  },
  person_posted_relevant_topic: {
    bucket: "person",
    label: "Buyer posted on topic",
    priority: 70,
    icon: User,
    tone: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  },
  person_engaged_with_topic: {
    bucket: "person",
    label: "Buyer engaged with topic",
    priority: 65,
    icon: User,
    tone: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  },
  // Promoted 2026-07-07 (signal tidy-up) — kept in step with
  // lib/dashboard/buyingTriggers.ts.
  breach_mention: {
    bucket: "breach",
    label: "Breach reported",
    priority: 96,
    icon: ShieldAlert,
    tone: "border-red-400/40 bg-red-400/10 text-red-300",
  },
  hiring_grc: {
    bucket: "hiring",
    label: "Hiring GRC",
    priority: 58,
    icon: User,
    tone: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  },
  social_vendor_relationship: {
    bucket: "person",
    label: "Talking about vendors",
    priority: 85,
    icon: User,
    tone: "border-violet-400/40 bg-violet-400/10 text-violet-300",
  },
};

/** Display meta for org-extra trigger types (per-org weights promote
 * types that have no bespoke entry above, e.g. cve_in_stack). */
function fallbackCategory(signalType: string): TriggerCategory {
  return {
    bucket: "breach",
    label: signalTypeLabel(signalType),
    priority: 50,
    icon: ShieldAlert,
    tone: "border-slate-400/40 bg-slate-400/10 text-slate-300",
  };
}

interface HotAccountRow {
  account: string;
  accountDomain: string | null;
  triggerType: string;
  category: TriggerCategory;
  headline: string;
  detectedAt: string;
  /** 1-3 relative heat within this list — the only rank the row shows. */
  flames: 1 | 2 | 3;
}

function AccountsMoving() {
  const { signalPriorities } = useOrg();
  const orgTriggerSet = useMemo(
    () => buyingTriggerSetFor(signalPriorities),
    [signalPriorities],
  );
  const { features } = useOrg();
  const ranking = !!features.signal_ranking;
  const { data: signals, isLoading: sLoad } = useSignals();
  const { data: leads, isLoading: lLoad } = useLeads();
  const { data: watchlist } = useWatchlist();
  const { data: companyById } = useCompaniesForCompactSignals(signals ?? []);

  const items = useMemo<HotAccountRow[]>(() => {
    const since = Date.now() - TODAYS_HOT_WINDOW_MS;

    // Accounts-first: "hot accounts" means the accounts the rep is WATCHING.
    // Without this, lead-scoped signals from the org's legacy lead list
    // (companies never added to the watchlist) surface here and crowd out
    // the curated accounts. Scope strictly to watched domains.
    const watchedDomains = new Set<string>();
    for (const w of watchlist ?? []) {
      if (w.company_domain) watchedDomains.add(w.company_domain.toLowerCase());
    }
    const leadsById = new Map<string, { name: string; domain: string | null }>();
    for (const l of leads ?? []) {
      const name =
        l.company_name ||
        [l.first_name, l.last_name].filter(Boolean).join(" ") ||
        l.email ||
        "";
      leadsById.set(l.id, {
        name,
        domain: (l as { company_domain?: string | null }).company_domain ?? null,
      });
    }

    // Per-account collapse. Key = lowercased domain (preferred) or
    // account name. We keep the SINGLE strongest signal per account
    // — strength = trigger priority + small recency bonus. Flames are
    // assigned after the final sort, relative to the list's max.
    const perAccount = new Map<
      string,
      Omit<HotAccountRow, "flames"> & { _strength: number }
    >();

    for (const s of signals ?? []) {
      if (!s.detected_at) continue;
      if (new Date(s.detected_at).getTime() < since) continue;

      // Strict whitelist — drop everything that isn't an opener-worthy
      // signal type. No social_company_mention, no partnerships, no
      // product launches.
      const category =
        TYPE_TO_CATEGORY[s.signal_type] ??
        (orgTriggerSet.has(s.signal_type)
          ? fallbackCategory(s.signal_type)
          : undefined);
      if (!category) continue;

      // Resolve account
      const sAny = s as { company_id?: string | null; lead_id?: string | null };
      let account = "";
      let accountDomain: string | null = null;
      if (sAny.company_id && companyById?.has(sAny.company_id)) {
        const c = companyById.get(sAny.company_id)!;
        account = c.name ?? "";
        accountDomain = c.domain ?? null;
      } else if (sAny.lead_id && leadsById.has(sAny.lead_id)) {
        const l = leadsById.get(sAny.lead_id)!;
        account = l.name;
        accountDomain = l.domain;
      }
      if (!account) continue;

      // Drop anything not on the watchlist (legacy leads, unwatched cos).
      if (!accountDomain || !watchedDomains.has(accountDomain.toLowerCase())) continue;

      // Build headline + freshness gate
      const data = (s.signal_data ?? {}) as Record<string, unknown>;
      const rawHeadline = (
        (typeof data.quoted_excerpt === "string" && data.quoted_excerpt) ||
        (typeof data.summary === "string" && data.summary) ||
        (typeof data.headline === "string" && data.headline) ||
        (typeof data.detail === "string" && data.detail) ||
        s.signal_type
      )
        .toString()
        .trim();
      if (isStaleByHeadline(rawHeadline, s.signal_type)) continue;

      // Recency bonus — exponential decay over 7 days, 0..15 points
      const ageDays = Math.max(
        0,
        (Date.now() - new Date(s.detected_at).getTime()) / 86_400_000,
      );
      const recencyBonus = Math.round(15 * Math.exp(-ageDays / 3));
      const strength = category.priority + recencyBonus;

      const key = (accountDomain ?? account).toLowerCase();
      const existing = perAccount.get(key);
      if (!existing || existing._strength < strength) {
        perAccount.set(key, {
          account,
          accountDomain,
          triggerType: s.signal_type,
          category,
          headline: scrubBackendNames(rawHeadline),
          detectedAt: s.detected_at,
          _strength: strength,
        });
      }
    }

    const ranked = Array.from(perAccount.values())
      .sort((a, b) => b._strength - a._strength)
      .slice(0, TODAYS_HOT_MAX);
    const maxStrength = ranked[0]?._strength || 1;
    return ranked.map(({ _strength, ...row }) => ({
      ...row,
      flames: (_strength >= maxStrength * 0.66
        ? 3
        : _strength >= maxStrength * 0.33
          ? 2
          : 1) as 1 | 2 | 3,
    }));
  }, [signals, leads, watchlist, companyById, orgTriggerSet]);

  // Trending: the standing 30-day heat rank (the old "Hottest accounts"
  // card), minus anything already shown as a fresh trigger above.
  const { data: accountScores } = useAccountScores({ sinceDays: 30 });
  const trending = useMemo(() => {
    if (!accountScores || !watchlist) return [];
    const shown = new Set(
      items.map((i) => (i.accountDomain ?? i.account).toLowerCase()),
    );
    const byDomain = new Map<string, string>();
    for (const w of watchlist) {
      const dom = (w.company_domain ?? "").toLowerCase();
      if (dom) byDomain.set(dom, w.company_name ?? dom);
    }
    return Array.from(accountScores.entries())
      .filter(([domain]) => byDomain.has(domain) && !shown.has(domain))
      .map(([domain, info]) => ({
        domain,
        name: byDomain.get(domain)!,
        score: info.score,
        signalCount: info.signalCount,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [accountScores, watchlist, items]);

  const loading = sLoad || lLoad;

  return (
    <Card delay={0.1} id="accounts-moving" className="h-full scroll-mt-24">
      <div className="flex items-start justify-between gap-3 p-5">
        <SectionHeader title="Hottest accounts" />
        <Link
          href="/dashboard/feed"
          className="shrink-0 text-[11.5px] text-text-muted transition-colors hover:text-text-secondary"
        >
          All signals →
        </Link>
      </div>
      <ul className="max-h-[420px] divide-y divide-border-subtle overflow-y-auto [scrollbar-width:thin] [mask-image:linear-gradient(to_bottom,black_calc(100%-36px),transparent)]">
        {loading && items.length === 0 ? (
          Array.from({ length: 3 }).map((_, i) => (
            <li key={`sk-${i}`} className="px-5 py-3.5">
              <Shimmer className="h-10 w-full" />
            </li>
          ))
        ) : items.length === 0 && trending.length === 0 ? (
          <li className="px-5 pb-5 text-[12.5px] text-text-muted">
            Nothing moving yet. Fresh signals on your watched accounts land
            here.
          </li>
        ) : (
          <>
          {items.slice(0, 5).map((item) => (
            <li key={item.accountDomain ?? item.account} className="hover:bg-bg-elevated/40">
              <Link
                href={
                  item.accountDomain
                    ? `/dashboard/accounts/${encodeURIComponent(item.accountDomain)}`
                    : "/dashboard/feed"
                }
                className="flex items-center gap-3 px-5 py-3"
                onClick={() => track(EV.signalClicked, { category: item.category.label })}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3" title={item.headline}>
                  <CompanyFavicon
                    domain={item.accountDomain ?? ""}
                    name={item.account}
                  />
                  <span className="truncate text-[13.5px] font-medium text-text-primary">
                    {item.account}
                  </span>
                </div>
                <span className="shrink-0 text-[14px] leading-none" aria-hidden>
                  {"🔥".repeat(item.flames)}
                </span>
              </Link>
            </li>
          ))}
          {trending.map((r) => {
            const maxScore = trending[0]?.score || 1;
            const flames =
              r.score >= maxScore * 0.66 ? 3 : r.score >= maxScore * 0.33 ? 2 : 1;
            return (
              <li key={r.domain} className="hover:bg-bg-elevated/40">
                <Link
                  href={`/dashboard/accounts/${encodeURIComponent(r.domain)}`}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <CompanyFavicon domain={r.domain} name={r.name} />
                    <div className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-text-primary">
                      {r.name}
                    </div>
                  </div>
                  <span
                    className="shrink-0 text-[14px] leading-none"
                    title={`Relevance score ${r.score.toFixed(2)}`}
                    aria-hidden
                  >
                    {"🔥".repeat(flames)}
                  </span>
                </Link>
              </li>
            );
          })}
          </>
        )}
      </ul>
    </Card>
  );
}

function useCompaniesForCompactSignals(signals: ReadonlyArray<unknown>) {
  const { orgId } = useOrg();
  const ids = useMemo(() => {
    const out = new Set<string>();
    for (const s of signals) {
      const sAny = s as { company_id?: string | null };
      if (sAny.company_id) out.add(sAny.company_id);
    }
    return Array.from(out).sort();
  }, [signals]);
  return useQuery({
    queryKey: ["companies_by_ids_compact", orgId, ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const sb = createSupabaseBrowserClient();
      const { data, error } = await sb
        .from("companies")
        .select("id, name, domain")
        .in("id", ids);
      if (error) throw error;
      const m = new Map<string, { name: string | null; domain: string | null }>();
      for (const c of (data ?? []) as Array<{
        id: string;
        name: string | null;
        domain: string | null;
      }>) {
        m.set(c.id, { name: c.name, domain: c.domain });
      }
      return m;
    },
    staleTime: 60_000,
  });
}

