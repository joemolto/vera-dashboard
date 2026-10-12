"use client";

/**
 * AnalyticsV2 — data-dense analytics rebuild (2026-06-08).
 *
 * Old page was lead-centric (hot/warm/cold leads, enriched-per-day),
 * showed vanity counts (714 signals), and had no credit accountability.
 * Vera pivoted to accounts months ago; this page catches up.
 *
 * Five sections, all scoped by the time-window filter at the top:
 *   1. Coverage KPIs (4 cards with deltas vs previous window)
 *   2. Signal activity over time (stacked by category)
 *   3. Working / Underperforming side-by-side
 *   4. Trigger-type breakdown (bar chart, strict whitelist)
 *   5. Credit ledger (where credits went + burn rate)
 *
 * Same gating model as everything else — features.analytics_v2 on
 * opt-in orgs only; other orgs keep the legacy page.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Coins,
  Eye,
  Flame,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  EmptyState,
  PageHeader,
  PageShell,
  SectionHeader,
  Shimmer,
} from "@/components/dashboard/primitives";
import { useOrg } from "@/components/dashboard/OrgContext";
import { buyingTriggerSetFor } from "@/lib/dashboard/buyingTriggers";
import {
  useAccountSuggestions,
  useCreditUsage,
  useSignals,
  useWatchlist,
} from "@/lib/dashboard/queries";
import { isStaleByHeadline } from "@/lib/dashboard/signalFreshness";
import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants — kept in sync with HomeV2's TodaysHotAccounts whitelist so the
// "Buying triggers" number on Home and Analytics match exactly.
// ---------------------------------------------------------------------------
/** Shared, org-aware buying-trigger set (lib/dashboard/buyingTriggers).
 * The local copy this replaces had drifted — it was missing the
 * credential-leak types entirely, so Analytics undercounted triggers. */
function useTriggerSet(): ReadonlySet<string> {
  const { signalPriorities } = useOrg();
  return useMemo(() => buyingTriggerSetFor(signalPriorities), [signalPriorities]);
}

const TRIGGER_LABELS: Record<string, string> = {
  social_breach_mention: "Breach mention",
  breach_proximity: "Peer breach",
  security_leadership_hire: "New security leader",
  social_leadership_change: "Leadership change",
  new_leadership: "New leadership",
  recently_funded: "Funding round",
  social_funding_news: "Funding news",
  recent_acquisition: "Acquisition",
  security_team_expansion: "Security team scaling",
  hiring_security: "Security hiring",
  person_engaged_with_competitor: "Buyer engaged with competitor",
  person_new_in_role: "Buyer new in role",
  person_posted_relevant_topic: "Buyer posted on topic",
  person_engaged_with_topic: "Buyer engaged with topic",
};

// Category buckets — used for the stacked area chart so reps see the
// MIX of trigger types, not just one undifferentiated line.
const TRIGGER_CATEGORY: Record<string, "breach" | "leadership" | "funding" | "hiring" | "person"> = {
  social_breach_mention: "breach",
  breach_proximity: "breach",
  security_leadership_hire: "leadership",
  social_leadership_change: "leadership",
  new_leadership: "leadership",
  recently_funded: "funding",
  social_funding_news: "funding",
  recent_acquisition: "funding",
  security_team_expansion: "hiring",
  hiring_security: "hiring",
  person_engaged_with_competitor: "person",
  person_new_in_role: "person",
  person_posted_relevant_topic: "person",
  person_engaged_with_topic: "person",
};

const CATEGORY_COLOR: Record<string, string> = {
  breach: "rgb(248 113 113)",       // red-400
  leadership: "rgb(251 191 36)",    // amber-400
  funding: "rgb(56 189 248)",       // sky-400
  hiring: "rgb(167 139 250)",       // violet-400
  person: "rgb(52 211 153)",        // emerald-400
};

type Window = "7d" | "30d" | "3mo" | "month";

const WINDOWS: Array<{ id: Window; label: string }> = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "3mo", label: "3 months" },
  { id: "month", label: "This month" },
];

function windowDays(w: Window): number {
  if (w === "7d") return 7;
  if (w === "30d") return 30;
  if (w === "3mo") return 90;
  // "month": days since 1st of current month
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return Math.max(1, Math.round((now.getTime() - first.getTime()) / 86_400_000));
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function AnalyticsV2() {
  const { features } = useOrg();
  // Vera Solo is sold on caps, not credits — never show credit language.
  const isSolo = !!features.solo_plan;
  const [window, setWindow] = useState<Window>("30d");
  const sinceDays = windowDays(window);
  const sinceMs = Date.now() - sinceDays * 86_400_000;
  // Previous-window comparison for delta arrows
  const prevSinceMs = sinceMs - sinceDays * 86_400_000;

  return (
    <PageShell>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <PageHeader
          eyebrow="Analytics"
          title="Watchlist performance"
          subtitle={
            isSolo
              ? "What's working, what isn't, and where Vera focused."
              : "What's working, what isn't, and where your credits went."
          }
        />
        <WindowFilter active={window} onChange={setWindow} />
      </div>

      <div className="mt-8 flex flex-col gap-5">
        <CoverageKpis sinceMs={sinceMs} prevSinceMs={prevSinceMs} sinceDays={sinceDays} />
        <SignalActivityStacked sinceMs={sinceMs} window={window} />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <TopAccounts sinceMs={sinceMs} />
          <UnderperformingAccounts />
        </div>
        <TriggerBreakdown sinceMs={sinceMs} />
        {!isSolo && <CreditLedgerCard sinceDays={sinceDays} />}
      </div>
    </PageShell>
  );
}

function WindowFilter({
  active,
  onChange,
}: {
  active: Window;
  onChange: (w: Window) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1.5">
      {WINDOWS.map((w) => {
        const isActive = active === w.id;
        return (
          <button
            key={w.id}
            type="button"
            onClick={() => onChange(w.id)}
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1.5 text-[12.5px] transition-colors",
              isActive
                ? "border-accent/40 bg-accent/10 text-text-primary"
                : "border-border-default bg-bg-card text-text-secondary hover:border-border-strong",
            )}
          >
            {w.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 1 — Coverage KPIs with deltas
// ---------------------------------------------------------------------------
function CoverageKpis({
  sinceMs,
  prevSinceMs,
  sinceDays,
}: {
  sinceMs: number;
  prevSinceMs: number;
  sinceDays: number;
}) {
  const triggerSet = useTriggerSet();
  const { data: watchlist, isLoading: wLoad } = useWatchlist();
  const { data: signals, isLoading: sLoad } = useSignals();
  const { data: suggestions, isLoading: sgLoad } = useAccountSuggestions();

  const loading = wLoad || sLoad || sgLoad;

  const activeAccounts = watchlist?.length ?? 0;

  const hotAccounts = useMemo(() => {
    if (!watchlist) return 0;
    const cutoff = Date.now() - 7 * 86_400_000;
    let n = 0;
    for (const w of watchlist) {
      if (w.last_monitored_at && new Date(w.last_monitored_at).getTime() > cutoff) n++;
    }
    return n;
  }, [watchlist]);

  const { triggersWindow, triggersPrev } = useMemo(() => {
    if (!signals) return { triggersWindow: 0, triggersPrev: 0 };
    const acctsWindow = new Set<string>();
    const acctsPrev = new Set<string>();
    for (const s of signals) {
      if (!s.detected_at) continue;
      if (!triggerSet.has(s.signal_type)) continue;
      const t = new Date(s.detected_at).getTime();
      const key =
        (s as { company_id?: string | null }).company_id ||
        (s as { lead_id?: string | null }).lead_id;
      if (!key) continue;
      if (t >= sinceMs) acctsWindow.add(key);
      else if (t >= prevSinceMs) acctsPrev.add(key);
    }
    return { triggersWindow: acctsWindow.size, triggersPrev: acctsPrev.size };
  }, [signals, sinceMs, prevSinceMs]);

  const suggestionsCount = suggestions?.length ?? 0;
  const coverageRatio = activeAccounts > 0
    ? Math.round((hotAccounts / activeAccounts) * 100)
    : 0;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiCardDelta
        icon={<Eye size={14} strokeWidth={1.8} />}
        label="Active accounts"
        value={loading ? null : activeAccounts.toString()}
        sub={`${coverageRatio}% hot`}
      />
      <KpiCardDelta
        icon={<Flame size={14} strokeWidth={1.8} />}
        label="Hot accounts"
        value={loading ? null : hotAccounts.toString()}
        sub="Last 7 days"
      />
      <KpiCardDelta
        icon={<TrendingUp size={14} strokeWidth={1.8} />}
        label="Buying triggers"
        value={loading ? null : triggersWindow.toString()}
        sub={`vs ${triggersPrev} prior ${sinceDays}d`}
        delta={triggersWindow - triggersPrev}
        deltaPositive={triggersWindow >= triggersPrev}
      />
      <KpiCardDelta
        icon={<Sparkles size={14} strokeWidth={1.8} />}
        label="Suggestions pending"
        value={loading ? null : suggestionsCount.toString()}
        sub={suggestionsCount > 0 ? "Matching your ICP" : "Pool empty"}
      />
    </div>
  );
}

function KpiCardDelta({
  icon,
  label,
  value,
  sub,
  delta,
  deltaPositive,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  sub: string;
  delta?: number;
  deltaPositive?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border-default bg-bg-card p-5">
      <div className="flex items-center gap-2 text-text-muted">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-subtle bg-bg-elevated">
          {icon}
        </span>
        <span className="text-[12.5px] font-medium text-text-secondary">{label}</span>
      </div>
      <div className="flex items-baseline gap-3">
        {value === null ? (
          <Shimmer className="h-9 w-16" />
        ) : (
          <span className="font-display text-[1.6rem] font-medium leading-none tracking-tight text-text-primary">
            {value}
          </span>
        )}
        {delta !== undefined && delta !== 0 ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[10px]",
              deltaPositive
                ? "bg-emerald-400/10 text-emerald-300"
                : "bg-red-400/10 text-red-300",
            )}
          >
            {deltaPositive ? (
              <ArrowUp size={9} strokeWidth={2.5} />
            ) : (
              <ArrowDown size={9} strokeWidth={2.5} />
            )}
            {Math.abs(delta)}
          </span>
        ) : null}
      </div>
      <div className="text-[11.5px] text-text-muted">{sub}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 2 — Signal activity stacked by category
// ---------------------------------------------------------------------------
function SignalActivityStacked({
  sinceMs,
  window,
}: {
  sinceMs: number;
  window: Window;
}) {
  const { data: signals, isLoading } = useSignals();

  const data = useMemo(() => {
    if (!signals) return [];
    const buckets = new Map<
      string,
      { date: string; label: string; breach: number; leadership: number; funding: number; hiring: number; person: number }
    >();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(sinceMs);
    start.setHours(0, 0, 0, 0);

    const cursor = new Date(start);
    while (cursor <= today) {
      const key = cursor.toISOString().slice(0, 10);
      buckets.set(key, {
        date: key,
        label: formatDateLabel(key, window),
        breach: 0,
        leadership: 0,
        funding: 0,
        hiring: 0,
        person: 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    for (const s of signals) {
      if (!s.detected_at) continue;
      const cat = TRIGGER_CATEGORY[s.signal_type];
      if (!cat) continue; // strict whitelist
      const t = new Date(s.detected_at).getTime();
      if (t < sinceMs) continue;
      const data = (s.signal_data ?? {}) as Record<string, unknown>;
      const headline = String(
        data.headline || data.summary || data.quoted_excerpt || s.signal_type,
      );
      if (isStaleByHeadline(headline, s.signal_type)) continue;
      const key = new Date(t).toISOString().slice(0, 10);
      const bucket = buckets.get(key);
      if (bucket) (bucket as any)[cat] += 1;
    }

    return Array.from(buckets.values());
  }, [signals, sinceMs, window]);

  const hasData = data.some(
    (d) => d.breach + d.leadership + d.funding + d.hiring + d.person > 0,
  );

  return (
    <Card delay={0.05}>
      <div className="flex items-start justify-between gap-3 p-5">
        <SectionHeader
          title="Signal activity"
        />
        <CategoryLegend />
      </div>
      <div className="px-2 pb-5 md:px-3 md:pb-6">
        <div className="h-[200px] w-full">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-[12px] text-text-muted">
              Loading…
            </div>
          ) : !hasData ? (
            <div className="flex h-full items-center justify-center text-[12px] text-text-muted">
              No buying triggers in this window.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(255 255 255 / 0.05)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10.5, fill: "rgb(180 180 195)" }}
                  axisLine={{ stroke: "rgb(255 255 255 / 0.08)" }}
                  tickLine={false}
                  minTickGap={20}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10.5, fill: "rgb(180 180 195)" }}
                  axisLine={{ stroke: "rgb(255 255 255 / 0.08)" }}
                  tickLine={false}
                  width={30}
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
                  dataKey="breach"
                  stackId="1"
                  stroke={CATEGORY_COLOR.breach}
                  fill={CATEGORY_COLOR.breach}
                  fillOpacity={0.45}
                  strokeWidth={1}
                />
                <Area
                  type="monotone"
                  dataKey="leadership"
                  stackId="1"
                  stroke={CATEGORY_COLOR.leadership}
                  fill={CATEGORY_COLOR.leadership}
                  fillOpacity={0.45}
                  strokeWidth={1}
                />
                <Area
                  type="monotone"
                  dataKey="funding"
                  stackId="1"
                  stroke={CATEGORY_COLOR.funding}
                  fill={CATEGORY_COLOR.funding}
                  fillOpacity={0.45}
                  strokeWidth={1}
                />
                <Area
                  type="monotone"
                  dataKey="hiring"
                  stackId="1"
                  stroke={CATEGORY_COLOR.hiring}
                  fill={CATEGORY_COLOR.hiring}
                  fillOpacity={0.45}
                  strokeWidth={1}
                />
                <Area
                  type="monotone"
                  dataKey="person"
                  stackId="1"
                  stroke={CATEGORY_COLOR.person}
                  fill={CATEGORY_COLOR.person}
                  fillOpacity={0.45}
                  strokeWidth={1}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </Card>
  );
}

function CategoryLegend() {
  const items: Array<{ key: string; label: string }> = [
    { key: "breach", label: "Breach" },
    { key: "leadership", label: "Leadership" },
    { key: "funding", label: "Funding" },
    { key: "hiring", label: "Hiring" },
    { key: "person", label: "Person" },
  ];
  return (
    <div className="hidden flex-wrap gap-2 md:flex">
      {items.map((i) => (
        <span
          key={i.key}
          className="inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.1em] text-text-muted"
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: CATEGORY_COLOR[i.key] }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function formatDateLabel(dateIso: string, window: Window): string {
  const d = new Date(dateIso);
  if (window === "7d") {
    return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Section 3a — Top performing accounts (most buying triggers in window)
// ---------------------------------------------------------------------------
function TopAccounts({ sinceMs }: { sinceMs: number }) {
  const triggerSet = useTriggerSet();
  const { data: signals } = useSignals();
  const { data: watchlist } = useWatchlist();

  // Collect company_ids referenced by buying-trigger signals so we can
  // resolve them to (name, domain) via a single companies query.
  const companyIds = useMemo(() => {
    if (!signals) return [] as string[];
    const ids = new Set<string>();
    for (const s of signals) {
      if (!s.detected_at) continue;
      if (new Date(s.detected_at).getTime() < sinceMs) continue;
      if (!triggerSet.has(s.signal_type)) continue;
      const cid = (s as { company_id?: string | null }).company_id;
      if (cid) ids.add(cid);
    }
    return Array.from(ids).sort();
  }, [signals, sinceMs]);

  const { data: companiesById } = useCompaniesByIdsInline(companyIds);

  const rows = useMemo(() => {
    if (!signals || !watchlist || !companiesById) return [];
    // Build watchlist domain set so we only surface signals on accounts
    // the rep is actually watching (drops noise from companies that
    // share a name fragment but aren't on the list).
    const watchedDomains = new Set<string>();
    const acctNames = new Map<string, string>();
    for (const w of watchlist) {
      if (!w.company_domain) continue;
      const dom = w.company_domain.toLowerCase();
      watchedDomains.add(dom);
      acctNames.set(dom, w.company_name ?? w.company_domain);
    }

    const counts = new Map<string, { count: number; triggers: Map<string, number> }>();
    for (const s of signals) {
      if (!s.detected_at) continue;
      if (new Date(s.detected_at).getTime() < sinceMs) continue;
      if (!triggerSet.has(s.signal_type)) continue;
      const cid = (s as { company_id?: string | null }).company_id;
      if (!cid) continue;
      const company = companiesById.get(cid);
      const dom = (company?.domain ?? "").toLowerCase();
      if (!dom || !watchedDomains.has(dom)) continue;
      const prev = counts.get(dom) ?? { count: 0, triggers: new Map() };
      prev.count += 1;
      prev.triggers.set(s.signal_type, (prev.triggers.get(s.signal_type) ?? 0) + 1);
      counts.set(dom, prev);
    }

    return Array.from(counts.entries())
      .map(([dom, info]) => ({
        domain: dom,
        name: acctNames.get(dom) ?? dom,
        count: info.count,
        topTrigger: pickTopTrigger(info.triggers),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [signals, watchlist, companiesById, sinceMs]);

  return (
    <Card delay={0.1} className="h-full">
      <div className="p-5">
        <SectionHeader
          title="Most active accounts"
          subtitle="Accounts generating the most buying signals in this window."
        />
      </div>
      <ul className="divide-y divide-border-subtle">
        {rows.length === 0 ? (
          <li className="px-6 pb-6 text-[12.5px] text-text-muted md:px-7 md:pb-7">
            No buying triggers from monitored accounts yet.
          </li>
        ) : (
          rows.map((r) => (
            <li key={r.domain} className="hover:bg-bg-elevated/40">
              <Link
                href={`/dashboard/accounts/${encodeURIComponent(r.domain)}`}
                className="flex items-center justify-between gap-3 px-6 py-3.5 md:px-7"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-text-primary">
                    {r.name}
                  </div>
                  <div className="truncate text-[11px] text-text-muted">
                    {r.topTrigger
                      ? `${TRIGGER_LABELS[r.topTrigger] ?? r.topTrigger}${r.count > 1 ? ` + ${r.count - 1} more` : ""}`
                      : "—"}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[14px] font-semibold tabular-nums text-text-primary">
                    {r.count}
                  </div>
                  <div className="text-[10px] text-text-muted">
                    signal{r.count === 1 ? "" : "s"}
                  </div>
                </div>
              </Link>
            </li>
          ))
        )}
      </ul>
    </Card>
  );
}

function useCompaniesByIdsInline(ids: string[]) {
  return useQuery({
    queryKey: ["companies_by_ids_analytics", ids],
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

function pickTopTrigger(triggers: Map<string, number>): string | null {
  let top: string | null = null;
  let topCount = 0;
  for (const [t, c] of triggers) {
    if (c > topCount) {
      top = t;
      topCount = c;
    }
  }
  return top;
}

// ---------------------------------------------------------------------------
// Section 3b — Underperforming accounts (no signals in 30d)
// ---------------------------------------------------------------------------
function UnderperformingAccounts() {
  const { data: signals } = useSignals();
  const { data: watchlist } = useWatchlist();

  const rows = useMemo(() => {
    if (!signals || !watchlist) return [];
    const cutoff = Date.now() - 30 * 86_400_000;
    const signalDomains = new Set<string>();
    // Map company_id → domain via... we don't have this lookup here.
    // Conservative version: use last_monitored_at on watchlist row as the
    // "any activity" proxy.
    const stale: Array<{ domain: string; name: string; daysSince: number }> = [];
    for (const w of watchlist) {
      if (!w.company_domain) continue;
      const last = w.last_monitored_at
        ? new Date(w.last_monitored_at).getTime()
        : 0;
      if (last < cutoff) {
        const days = last === 0 ? 999 : Math.round((Date.now() - last) / 86_400_000);
        stale.push({
          domain: w.company_domain.toLowerCase(),
          name: w.company_name ?? w.company_domain,
          daysSince: days,
        });
      }
    }
    return stale.sort((a, b) => b.daysSince - a.daysSince).slice(0, 5);
  }, [signals, watchlist]);

  return (
    <Card delay={0.15} className="h-full">
      <div className="p-5">
        <SectionHeader
          title="Quiet accounts"
          subtitle="No buying signals in 30+ days — worth a review or a nudge."
        />
      </div>
      <ul className="divide-y divide-border-subtle">
        {rows.length === 0 ? (
          <li className="px-6 pb-6 text-[12.5px] text-text-muted md:px-7 md:pb-7">
            Every account has been touched recently — good coverage.
          </li>
        ) : (
          rows.map((r) => (
            <li key={r.domain} className="hover:bg-bg-elevated/40">
              <Link
                href={`/dashboard/accounts/${encodeURIComponent(r.domain)}`}
                className="flex items-center justify-between gap-3 px-6 py-3.5 md:px-7"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <AlertTriangle
                    size={13}
                    strokeWidth={1.7}
                    className="shrink-0 text-amber-400/60"
                    aria-hidden
                  />
                  <span className="truncate text-[13px] font-medium text-text-primary">
                    {r.name}
                  </span>
                </div>
                <span className="shrink-0 text-[11px] text-text-muted">
                  {r.daysSince >= 999 ? "no signals yet" : `last signal ${r.daysSince}d ago`}
                </span>
              </Link>
            </li>
          ))
        )}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section 4 — Trigger-type breakdown
// ---------------------------------------------------------------------------
function TriggerBreakdown({ sinceMs }: { sinceMs: number }) {
  const triggerSet = useTriggerSet();
  const { data: signals, isLoading } = useSignals();

  const data = useMemo(() => {
    if (!signals) return [];
    const counts = new Map<string, number>();
    for (const s of signals) {
      if (!s.detected_at) continue;
      if (new Date(s.detected_at).getTime() < sinceMs) continue;
      if (!triggerSet.has(s.signal_type)) continue;
      counts.set(s.signal_type, (counts.get(s.signal_type) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([type, n]) => ({
        type,
        label: TRIGGER_LABELS[type] ?? type,
        count: n,
        category: TRIGGER_CATEGORY[type],
      }))
      .sort((a, b) => b.count - a.count);
  }, [signals, sinceMs]);

  return (
    <Card delay={0.2}>
      <div className="p-5">
        <SectionHeader
          title="Trigger breakdown"
        />
      </div>
      <div className="px-6 pb-6 md:px-7 md:pb-7">
        {isLoading ? (
          <Shimmer className="h-40 w-full" />
        ) : data.length === 0 ? (
          <EmptyState
            icon={<TrendingUp size={16} strokeWidth={1.6} />}
            title="No buying triggers in this window"
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {data.map((row) => {
              const max = data[0].count || 1;
              const pct = (row.count / max) * 100;
              const color = CATEGORY_COLOR[row.category] ?? "rgb(180 180 195)";
              return (
                <div key={row.type}>
                  <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
                    <span className="text-text-secondary">{row.label}</span>
                    <span className="font-mono text-[11px] text-text-muted">
                      {row.count}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-bg-elevated">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: color, opacity: 0.75 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section 5 — Credit ledger
// ---------------------------------------------------------------------------
function CreditLedgerCard({ sinceDays }: { sinceDays: number }) {
  const { data: usage, isLoading } = useCreditUsage({ sinceDays });

  const burnPerDay = useMemo(() => {
    if (!usage) return 0;
    return Math.round((usage.total_units / Math.max(1, sinceDays)) * 10) / 10;
  }, [usage, sinceDays]);

  return (
    <Card delay={0.25}>
      <div className="p-5">
        <SectionHeader
          title="Credit usage"
          subtitle="Where your credits went in this window."
        />
      </div>
      <div className="px-6 pb-6 md:px-7 md:pb-7">
        {isLoading ? (
          <Shimmer className="h-32 w-full" />
        ) : !usage || usage.total_units === 0 ? (
          <EmptyState
            icon={<Coins size={16} strokeWidth={1.6} />}
            title="No credits used in this window"
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <div className="text-[11.5px] uppercase tracking-[0.14em] text-text-muted">
                Total used
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-[1.6rem] font-medium tracking-tight text-text-primary">
                  {usage.total_units}
                </span>
                <span className="text-[12px] text-text-muted">credits</span>
              </div>
              <div className="mt-2 text-[11.5px] text-text-muted">
                ~{burnPerDay} credits/day · projected{" "}
                {Math.round(burnPerDay * 30)} / month at this rate
              </div>
            </div>
            <div className="lg:col-span-2">
              <div className="text-[11.5px] uppercase tracking-[0.14em] text-text-muted mb-3">
                By action
              </div>
              <div className="flex flex-col gap-2">
                {usage.by_action.map((row) => {
                  const pct = (row.units / usage.total_units) * 100;
                  return (
                    <div key={row.action}>
                      <div className="flex items-baseline justify-between text-[12.5px]">
                        <span className="text-text-secondary">
                          {humanizeAction(row.action)}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-text-muted">
                          {row.units}{" "}
                          <span className="opacity-60">
                            ({row.count}× · {Math.round(pct)}%)
                          </span>
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-elevated">
                        <div
                          className="h-full rounded-full bg-accent/70"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function humanizeAction(action: string): string {
  const labels: Record<string, string> = {
    monitor_pass: "Monitor pass",
    deep_enrich: "Deep enrichment",
    person_unlock: "Person unlock",
    person_intel_pass: "Person intel",
    add_to_watchlist: "Add to watchlist",
  };
  return labels[action] ?? action.replace(/_/g, " ");
}
