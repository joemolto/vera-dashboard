"use client";

/**
 * Your market — TAM + market radar (pilot, features.market_v1).
 *
 * Reads /accounts/market/overview: the org's observed market (built from
 * the accounts they actually watch), a countable universe with the
 * classifier's cleaned estimate, coverage, estimated value from their own
 * deal size, and three verified radar slices (hiring security / funding
 * events / headcount growth). The engine serves a <24h snapshot instantly;
 * Refresh recomputes live (~a minute of Apollo searches + verification).
 *
 * Add-to-watchlist reuses /accounts/solo/onboarding-seed (active +
 * monitored + enrich, cap-enforced). Replace with a dedicated market-add
 * endpoint if market_v1 rolls out beyond the pilot.
 */

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Pencil, Plus, Radar, RefreshCw } from "lucide-react";
import { useOrg } from "@/components/dashboard/OrgContext";
import {
  MarketEditorDrawer,
  type MarketRecord,
  type MarketsListResponse,
} from "@/components/dashboard/widgets/MarketEditorDrawer";
import { claraApi } from "@/lib/dashboard/claraApi";
import { emitCapHit } from "@/lib/dashboard/upgradeSignal";
import { defaultCurrency } from "@/lib/dashboard/revenue";
import { cn } from "@/lib/utils";
import { SELF_HOSTED } from "@/lib/selfHosted";
import { logoUrl } from "@/lib/logoUrl";

interface MarketRow {
  name: string;
  domain: string;
  industry?: string | null;
  open_security_roles?: number;
  example_title?: string | null;
  example_posted_at?: string | null;
  event_type?: string;
  event_date?: string;
  event_amount?: string | null;
  event_currency?: string | null;
}

interface MarketSlice {
  key: string;
  label: string;
  total: number;
  est_clean?: number | null;
  rows: MarketRow[];
  new_domains?: string[];
}

interface MarketOverview {
  enabled: boolean;
  error?: string;
  generated_at?: string;
  profile?: {
    accounts: number;
    industries: [string, number][];
    countries: [string, number][];
    size_bands: [string, number][];
  };
  criteria?: { industries: string[]; locations: string[]; employee_ranges: string[] };
  universe?: { total: number; est_clean: number | null; keep_ratio: number | null };
  coverage?: { watching: number; pct: number | null };
  value?: { estimated_annual: number | null; avg_deal_size: number | null; currency?: string | null };
  slices?: MarketSlice[];
}

function sentence(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function fmtInt(n: number | null | undefined): string {
  return typeof n === "number" ? n.toLocaleString("en-GB") : "—";
}

const CURRENCY_SYMBOL: Record<string, string> = { GBP: "£", USD: "$", EUR: "€" };

function fmtMoney(n: number | null | undefined, sym = "$"): string | null {
  if (!n) return null;
  if (n >= 1_000_000_000) return `${sym}${(n / 1_000_000_000).toFixed(1)}b`;
  if (n >= 1_000_000) return `${sym}${Math.round(n / 1_000_000)}m`;
  return `${sym}${Math.round(n / 1_000)}k`;
}

/** ["1000,5000","500,1000"] → "500–5,000 employees" */
function fmtRanges(ranges: string[] | undefined): string | null {
  if (!ranges?.length) return null;
  const nums = ranges
    .map((r) => r.split(",").map((x) => parseInt(x, 10)))
    .filter((p) => p.length === 2 && !p.some(isNaN));
  if (!nums.length) return null;
  const lo = Math.min(...nums.map((p) => p[0]));
  const hi = Math.max(...nums.map((p) => p[1]));
  return `${lo.toLocaleString("en-GB")}–${hi.toLocaleString("en-GB")} employees`;
}

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function Mark({ name, domain }: { name: string; domain: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !domain) {
    return (
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border-subtle bg-bg-elevated text-[13px] font-semibold text-text-secondary">
        {(name || domain || "?").charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    // Same logo.dev source + fallback pattern as the onboarding AccountPicker.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl(domain, 128)}
      alt=""
      width={36}
      height={36}
      className="h-9 w-9 shrink-0 rounded-lg border border-border-subtle bg-white object-contain"
      onError={() => setFailed(true)}
    />
  );
}

function SliceGroup({
  slice,
  note,
  onAdd,
  added,
  leaving,
  adding,
  refilling,
}: {
  slice: MarketSlice;
  note?: string;
  onAdd: (row: MarketRow) => void;
  added: Set<string>;
  leaving: Set<string>;
  adding: string | null;
  refilling: boolean;
}) {
  const fresh = new Set(slice.new_domains || []);
  // Conveyor behaviour (adding is the hard part, so the list should never
  // shrink): an added row holds its green tick for
  // a beat (`leaving`), collapses out, and the next verified row from the
  // engine's bench fades into the slot (AnimatePresence below).
  const visible = slice.rows.filter((r) => !added.has(r.domain)).slice(0, 6);
  return (
    <div className="overflow-hidden rounded-xl border border-border-default bg-bg-card">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border-subtle px-5 py-3.5">
        <span className="text-[14px] font-semibold text-text-primary">{slice.label}</span>
        {fresh.size > 0 && (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11.5px] font-semibold text-accent">
            {fresh.size} new
          </span>
        )}
        {/* Cleaned estimate when the engine sends one — the raw Apollo
            keyword-tag total can be almost entirely vendors-to-the-sector
            on a vertical market (73 tagged, 0 real; 2026-08-27). */}
        <span className="text-[12px] text-text-secondary">
          {slice.est_clean != null ? `~${fmtInt(slice.est_clean)}` : fmtInt(slice.total)} companies
        </span>
        {note && <span className="ml-auto text-[11.5px] text-text-muted">{note}</span>}
      </div>
      {slice.rows.length === 0 ? (
        <div className="px-5 py-5 text-[13px] text-text-muted">
          Nothing verified to show this week.
        </div>
      ) : visible.length === 0 ? (
        <div className="flex items-center gap-2 px-5 py-5 text-[13px] text-text-muted">
          {refilling ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding more in your market…
            </>
          ) : (
            <>You&apos;ve added everything verified this week — more on the next check.</>
          )}
        </div>
      ) : (
        <AnimatePresence initial={false}>
          {visible.map((r) => {
          const isAdded = leaving.has(r.domain);
          const isAdding = adding === r.domain;
          const posted = fmtDate(r.example_posted_at);
          const eventDate = fmtDate(r.event_date);
          return (
            <motion.div
              key={r.domain}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, overflow: "hidden" }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="flex items-center gap-4 border-b border-border-subtle px-5 py-4 last:border-b-0"
            >
              <Mark name={r.name} domain={r.domain} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-text-primary">
                  {r.name}
                  <span className="ml-2 text-[12.5px] font-normal text-text-muted">{r.domain}</span>
                  {fresh.has(r.domain) && (
                    <span className="ml-2 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-accent">
                      New
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-[13px] text-text-secondary">
                  {slice.key === "hiring_security" && (
                    <>
                      {r.open_security_roles} open security {r.open_security_roles === 1 ? "role" : "roles"}
                      {r.example_title ? ` · ${r.example_title}` : ""}
                      {posted ? ` · posted ${posted}` : ""}
                    </>
                  )}
                  {slice.key === "funding" && (
                    <>
                      {r.event_type}
                      {r.event_amount ? ` · ${r.event_amount}` : ""}
                      {eventDate ? ` · ${eventDate}` : ""}
                    </>
                  )}
                  {slice.key === "growth" && (
                    <>
                      {r.industry ? `${sentence(r.industry)} · ` : ""}
                      Headcount up 10%+ over 6 months
                    </>
                  )}
                </div>
              </div>
              {slice.key === "hiring_security" && (
                <span className="hidden shrink-0 rounded-full bg-emerald-500/10 px-3 py-1 text-[12px] font-medium text-emerald-600 sm:inline dark:text-emerald-400">
                  Verified postings
                </span>
              )}
              <button
                type="button"
                disabled={isAdded || isAdding}
                onClick={() => onAdd(r)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[13px] font-medium transition-colors",
                  isAdded
                    ? "border-border-subtle text-text-muted"
                    : "border-accent/40 text-accent hover:bg-accent/10",
                )}
              >
                {isAdding ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isAdded ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {isAdded ? "Added" : "Add to watchlist"}
              </button>
            </motion.div>
          );
          })}
        </AnimatePresence>
      )}
    </div>
  );
}

export default function MarketPage() {
  const { orgId, features } = useOrg();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [toppingUp, setToppingUp] = useState<string | null>(null);
  const [benchDone, setBenchDone] = useState<Set<string>>(new Set());
  // multi_market (054): selected market per org, persisted locally.
  // null = the primary market (the pre-054 single-market behaviour).
  const [marketId, setMarketId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem(`vera-market-${orgId}`),
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMarket, setEditorMarket] = useState<MarketRecord | null>(null);

  // Defence-in-depth beside the nav flag — direct URL hits 404 without it.
  if (!features.market_v1) notFound();

  const marketsQuery = useQuery({
    queryKey: ["markets", orgId],
    queryFn: () =>
      claraApi<MarketsListResponse>("/accounts/market/markets", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId }),
      }),
    staleTime: 5 * 60 * 1000,
  });
  const markets = marketsQuery.data?.markets ?? [];
  const marketLimit = marketsQuery.data?.limit ?? 1;
  const primaryMarket = markets.find((m) => m.is_primary) ?? null;
  const activeMarket = (marketId && markets.find((m) => m.id === marketId)) || primaryMarket;

  useEffect(() => {
    if (marketId) window.localStorage.setItem(`vera-market-${orgId}`, marketId);
    else window.localStorage.removeItem(`vera-market-${orgId}`);
  }, [orgId, marketId]);

  // A stored selection whose market has been deleted falls back to primary.
  useEffect(() => {
    if (marketId && marketsQuery.data && !markets.some((m) => m.id === marketId)) {
      setMarketId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketId, marketsQuery.data]);

  // The conveyor state is per market — reset it on switch.
  useEffect(() => {
    setAdded(new Set());
    setLeaving(new Set());
    setAdding(null);
    setBenchDone(new Set());
  }, [marketId]);

  const query = useQuery({
    queryKey: ["market-overview", orgId, marketId],
    queryFn: () =>
      claraApi<MarketOverview>("/accounts/market/overview", {
        method: "POST",
        body: JSON.stringify({
          org_id: orgId,
          ...(marketId ? { market_id: marketId } : {}),
        }),
      }),
    staleTime: 5 * 60 * 1000,
  });

  const refresh = useMutation({
    mutationFn: (mid: string | null) =>
      claraApi<MarketOverview>("/accounts/market/overview", {
        method: "POST",
        body: JSON.stringify({
          org_id: orgId,
          refresh: true,
          ...(mid ? { market_id: mid } : {}),
        }),
      }),
    onMutate: () => setRefreshing(true),
    onSettled: () => setRefreshing(false),
    onSuccess: (data, mid) =>
      queryClient.setQueryData(["market-overview", orgId, mid], data),
  });

  const addAccount = useMutation({
    mutationFn: (row: MarketRow) =>
      claraApi("/accounts/solo/onboarding-seed", {
        method: "POST",
        body: JSON.stringify({
          org_id: orgId,
          accounts: [{ domain: row.domain, name: row.name }],
          ...(marketId ? { market_id: marketId } : {}),
        }),
      }),
    onMutate: (row) => setAdding(row.domain),
    onSettled: () => setAdding(null),
    onSuccess: (_data, row) => {
      // Hold the green tick for a beat, then let AnimatePresence collapse
      // the row and slide the next bench row in.
      setLeaving((prev) => new Set(prev).add(row.domain));
      window.setTimeout(() => {
        setAdded((prev) => new Set(prev).add(row.domain));
        setLeaving((prev) => {
          const next = new Set(prev);
          next.delete(row.domain);
          return next;
        });
      }, 700);
    },
  });

  const data = query.data;

  // Conveyor refill: when adds thin a slice below six visible rows, fetch
  // the next verified rows from the engine (otherwise a large market can
  // show no new companies going in). One slice at a time; a slice
  // that returns nothing is marked done until the next weekly check.
  const topup = useMutation({
    mutationFn: ({ sliceKey, exclude }: { sliceKey: string; exclude: string[] }) =>
      claraApi<{ enabled: boolean; rows: MarketRow[] }>("/accounts/market/slice-topup", {
        method: "POST",
        body: JSON.stringify({
          org_id: orgId,
          slice_key: sliceKey,
          exclude,
          ...(marketId ? { market_id: marketId } : {}),
        }),
      }),
    onMutate: ({ sliceKey }) => setToppingUp(sliceKey),
    onSettled: () => setToppingUp(null),
    onSuccess: (res, { sliceKey }) => {
      if (!res.rows?.length) {
        setBenchDone((prev) => new Set(prev).add(sliceKey));
        return;
      }
      queryClient.setQueryData<MarketOverview>(["market-overview", orgId, marketId], (cur) => {
        if (!cur?.slices) return cur;
        return {
          ...cur,
          slices: cur.slices.map((s) => {
            if (s.key !== sliceKey) return s;
            const have = new Set(s.rows.map((r) => r.domain));
            return { ...s, rows: [...s.rows, ...res.rows.filter((r) => !have.has(r.domain))] };
          }),
        };
      });
    },
  });

  useEffect(() => {
    if (!data?.slices || toppingUp) return;
    for (const s of data.slices) {
      const visibleCount = s.rows.filter((r) => !added.has(r.domain)).length;
      if (visibleCount < 6 && s.total > 0 && !benchDone.has(s.key)) {
        topup.mutate({
          sliceKey: s.key,
          exclude: [...s.rows.map((r) => r.domain), ...added],
        });
        break; // one refill in flight at a time
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, added, toppingUp, benchDone]);

  // Market switcher pills — rendered above every page state so the user
  // can always switch away, including mid cold-compute. "+ New market" is
  // visible to every tier: at the plan's market limit it opens the shared
  // upgrade modal instead of the editor (Starter 1 / Individual 3 / Team
  // custom).
  const marketPills =
    markets.length > 0 ? (
      <div className="flex flex-wrap items-center gap-2">
        {markets.map((m) => {
          const isActive = activeMarket?.id === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setMarketId(m.is_primary ? null : m.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[13px] font-medium transition-colors",
                isActive
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-border-default text-text-secondary hover:text-text-primary",
              )}
            >
              {m.name}
              {isActive && (
                <Pencil
                  aria-label={`Edit ${m.name}`}
                  className="h-3 w-3"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditorMarket(m);
                    setEditorOpen(true);
                  }}
                />
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            if (!SELF_HOSTED && markets.length >= marketLimit) {
              emitCapHit({
                cap: "markets",
                limit: marketLimit,
                message: `Your plan includes ${marketLimit} market${marketLimit === 1 ? "" : "s"}.`,
              });
              return;
            }
            setEditorMarket(null);
            setEditorOpen(true);
          }}
          className="flex items-center gap-1 rounded-full border border-dashed border-border-default px-4 py-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          <Plus className="h-3.5 w-3.5" /> New market
        </button>
      </div>
    ) : null;

  const editorDrawer = (
    <MarketEditorDrawer
      orgId={orgId}
      open={editorOpen}
      market={editorMarket}
      fallbackCriteria={
        editorMarket?.is_primary
          ? {
              industries: data?.criteria?.industries,
              locations: data?.criteria?.locations,
              employee_ranges: data?.criteria?.employee_ranges,
            }
          : undefined
      }
      onClose={() => setEditorOpen(false)}
      onSaved={(savedId, definitionChanged) => {
        const isNew = !editorMarket;
        setEditorOpen(false);
        void queryClient.invalidateQueries({ queryKey: ["markets", orgId] });
        const nextId = savedId === primaryMarket?.id ? null : savedId;
        setMarketId(nextId);
        if (isNew || !definitionChanged) {
          // New market: the overview query cold-computes on switch. Name or
          // deal-size edit: re-serve the snapshot with the new economics.
          void queryClient.invalidateQueries({
            queryKey: ["market-overview", orgId, nextId],
          });
        } else {
          refresh.mutate(nextId);
        }
      }}
      onDeleted={() => {
        setEditorOpen(false);
        setMarketId(null);
        void queryClient.invalidateQueries({ queryKey: ["markets", orgId] });
      }}
    />
  );

  if (query.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 pt-3">
        {marketPills}
        <div className="flex h-64 items-center justify-center gap-2 text-[13.5px] text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your market…
        </div>
        {editorDrawer}
      </div>
    );
  }

  if (!data || data.enabled === false) {
    return (
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 pt-3">
        {marketPills}
        <div className="mx-auto w-full max-w-[720px] rounded-xl border border-border-default bg-bg-card px-6 py-10 text-center text-[13.5px] text-text-secondary">
          Market view isn&apos;t available yet — the engine may still be deploying. Try again shortly.
        </div>
        {editorDrawer}
      </div>
    );
  }

  if (data.error === "no_criteria" || data.error === "unknown_market") {
    return (
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 pt-3">
        {marketPills}
        <div className="mx-auto w-full max-w-[720px] rounded-xl border border-border-default bg-bg-card px-6 py-10 text-center text-[13.5px] text-text-secondary">
          {data.error === "unknown_market"
            ? "That market no longer exists — switch to another one above."
            : "Add a few accounts to your watchlist first — Vera builds your market from the companies you actually track."}
        </div>
        {editorDrawer}
      </div>
    );
  }

  const industries = (data.criteria?.industries || []).map(sentence);
  const headline =
    industries.length > 0
      ? `${industries.slice(0, 4).join(", ")}${industries.length > 4 ? " and more" : ""}`
      : "Your market";
  const rangeLabel = fmtRanges(data.criteria?.employee_ranges);
  const locations = data.criteria?.locations?.join(" + ");
  const universeTotal = data.universe?.total ?? 0;
  const estClean = data.universe?.est_clean ?? null;
  const watching = (data.coverage?.watching ?? 0) + added.size;
  const denominator = estClean ?? universeTotal;
  const pct = denominator ? Math.round((1000 * watching) / denominator) / 10 : null;
  const currencySym =
    CURRENCY_SYMBOL[
      (data.value?.currency || defaultCurrency(data.criteria?.locations)).toUpperCase()
    ] ?? "$";
  const value = fmtMoney(data.value?.estimated_annual, currencySym);
  const movedThisWeek = (data.slices || []).reduce(
    (n, s) => n + (s.new_domains?.length || 0),
    0,
  );
  const checked = data.generated_at
    ? new Date(data.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : null;

  const sliceNotes: Record<string, string> = {
    hiring_security: "Strongest buying signal",
    funding: "Each event checked before it appears",
    growth: "Supporting signal",
  };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 pt-3">
      {marketPills}
      {/* Market definition */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border-default bg-bg-card px-6 py-5">
        <div className="min-w-0">
          <div className="text-[17px] font-semibold tracking-tight text-text-primary text-balance">
            {headline}
            {locations ? ` · ${locations}` : ""}
            {rangeLabel ? ` · ${rangeLabel}` : ""}
          </div>
          <div className="mt-3.5 flex flex-wrap gap-2">
            {(data.profile?.industries || []).slice(0, 4).map(([label, n]) => (
              <span
                key={label}
                className="rounded-full border border-border-default bg-bg-elevated px-3 py-1 text-[12.5px] text-text-secondary"
              >
                <b className="font-semibold text-text-primary">{n}</b> of your accounts:{" "}
                {label}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => refresh.mutate(marketId)}
          className="flex items-center gap-1.5 rounded-lg border border-border-default px-3.5 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {refreshing ? "Checking your market…" : "Check now"}
        </button>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div className="rounded-xl border border-border-default bg-bg-card px-5 py-4">
          <div className="text-[13px] text-text-secondary">Companies in your market</div>
          <div className="mt-1 text-[30px] font-semibold tracking-tight text-text-primary tabular-nums">
            {fmtInt(estClean ?? universeTotal)}
          </div>
          <div className="mt-1 text-[12px] text-text-muted">
            {estClean !== null
              ? `${fmtInt(universeTotal)} matched, non-buyers filtered out`
              : "matched — filtering runs on the next weekly check"}
          </div>
        </div>
        <div className="rounded-xl border border-border-default bg-bg-card px-5 py-4">
          <div className="text-[13px] text-text-secondary">You&apos;re watching</div>
          <div className="mt-1 text-[30px] font-semibold tracking-tight text-text-primary tabular-nums">
            {fmtInt(watching)}
            {pct !== null && (
              <span className="ml-2 text-[15px] font-medium text-text-muted">· {pct}%</span>
            )}
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border-default">
            <div
              className="h-full min-w-[6px] rounded-full bg-accent"
              style={{ width: `${Math.min(100, pct ?? 0)}%` }}
            />
          </div>
        </div>
        <div className="rounded-xl border border-border-default bg-bg-card px-5 py-4">
          <div className="text-[13px] text-text-secondary">Estimated market value</div>
          <div className="mt-1 text-[30px] font-semibold tracking-tight text-text-primary tabular-nums">
            {value ?? "—"}
            {value && <span className="ml-1 text-[15px] font-medium text-text-muted">/yr</span>}
          </div>
          <div className="mt-1 text-[12px] text-text-muted">
            {value
              ? `${fmtInt(estClean)} companies × your ${fmtMoney(data.value?.avg_deal_size, currencySym)} average deal`
              : "appears once the filtered count is in"}
          </div>
        </div>
        <div className="rounded-xl border border-border-default bg-bg-card px-5 py-4">
          <div className="text-[13px] text-text-secondary">Moved this week</div>
          <div className="mt-1 text-[30px] font-semibold tracking-tight text-text-primary tabular-nums">
            {fmtInt(movedThisWeek)}
          </div>
          <div className="mt-1 text-[12px] text-text-muted">
            Monitoring your TAM
          </div>
        </div>
      </div>

      {/* Radar */}
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 px-0.5">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-text-primary">
          <Radar className="h-4 w-4 text-accent" /> What moved in your market
        </h3>
        {checked && <span className="text-[12.5px] text-text-muted">Last checked {checked}</span>}
      </div>

      {(data.slices || []).map((slice) => (
        <SliceGroup
          key={slice.key}
          slice={slice}
          note={sliceNotes[slice.key]}
          onAdd={(row) => addAccount.mutate(row)}
          added={added}
          leaving={leaving}
          adding={adding}
          refilling={toppingUp === slice.key}
        />
      ))}
      {editorDrawer}
    </div>
  );
}
