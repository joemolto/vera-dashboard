"use client";

/**
 * UnifiedTimeline — single chronological feed of recent events across
 * the watchlist. Replaces the old IntelFeeds 2-column split.
 *
 * Pulls from three sources and merges:
 *   - signals (PL news, social_*, hiring, leadership, funding, etc.)
 *   - watchlist_alerts (engine-written change alerts)
 *   - threat_alerts (CVEs/breaches mapped onto stack)
 *
 * Each row resolves to an account name + headline + relative time +
 * click-through to the account page. Filter chips at the top narrow by
 * category — All / Breach / Movement / Social / Hiring. Default last 7d.
 *
 * Rule: no AI-slop framing. Headlines are the engine's
 * own short text; we don't wrap them in marketing language.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, ShieldAlert, TrendingUp, MessageSquare, Users, Activity } from "lucide-react";
import {
  Card,
  EmptyState,
  RelativeTime,
  SectionHeader,
  Shimmer,
} from "@/components/dashboard/primitives";
import {
  useLeads,
  useScoredSignals,
  useSignals,
  useWatchlist,
  useWatchlistAlerts,
} from "@/lib/dashboard/queries";
import { useOrg } from "@/components/dashboard/OrgContext";
import type { ScoredSignal, Signal } from "@/lib/dashboard/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { scrubBackendNames } from "@/lib/dashboard/labels";
import { isStaleByHeadline } from "@/lib/dashboard/signalFreshness";
import { cn } from "@/lib/utils";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ROWS = 40;

type Category = "breach" | "movement" | "social" | "hiring" | "other";

interface FeedItem {
  id: string;
  category: Category;
  /** Account name to show at the start of the row. */
  account: string;
  /** Optional domain so the row can deep-link to the account account page. */
  accountDomain: string | null;
  /** The single-line event summary. */
  headline: string;
  detectedAt: string;
  /** Source URL when the event has an external link (e.g. a Reddit post,
   * a CVE writeup). Renders an external-link icon when present. */
  sourceUrl: string | null;
  /** Per-client relevance score (0..1) when the org has signal_priorities
   * configured. Undefined for orgs on the global whitelist path. Used
   * to drive sort order when present. */
  score?: number;
}

// Map signal_type → category bucket. STRICTLY curated for cyber-sales
// opener-worthiness — if a signal doesn't give a rep a reason to call,
// it's not in this map and falls through to "other" which is filtered
// out entirely. The data is read through a sales lens: generic PR (product launches, partnerships, awards,
// expansion) gets dropped; only buying-trigger signals stay.
const SIGNAL_CATEGORY: Record<string, Category> = {
  // Breach / incident — peer-hit and news-mention only.
  // NOT cve_in_stack: that's the prospect's OWN vulnerability and
  // surfacing it on the home feed is ambulance-chasing. CVE data still lives on the
  // per-account record where the rep uses it as context, not opener.
  social_breach_mention: "breach",
  breach_proximity: "breach",
  // Movement — ONLY genuine buying triggers
  // Money moves (budget unlock):
  social_funding_news: "movement",
  recently_funded: "movement",
  recent_acquisition: "movement",
  // Leadership changes (new leader = vendor review window in first 90 days):
  social_leadership_change: "movement",
  new_leadership: "movement",
  security_leadership_hire: "movement",
  // Social — Haiku-filtered already, but exclude reviews/posts (PR fluff)
  social_employee_chatter: "social",
  social_complaint: "social",
  social_vendor_relationship: "social",
  social_company_mention: "social",
  // Hiring — security-specific only (general sales hiring isn't a
  // cyber buying trigger)
  social_hiring_buzz: "hiring",
  hiring_security: "hiring",
  hiring_grc: "hiring",
  security_team_expansion: "hiring",
  // DROPPED (intentionally not in map — falls through to filtered "other"):
  //   product_launch, new_partnership, expansion, social_milestone,
  //   social_company_post, social_customer_review, hiring_sales_bd.
  // These appear in news feeds but they don't give a rep a reason to
  // pick up the phone. They're still on the per-account record if
  // someone wants to drill in — just not on the home feed.
};

/** Categorise a signal_type for the *scoring* path. More permissive than
 * SIGNAL_CATEGORY: when a client puts a non-zero weight on a signal
 * type, they want to see it, so we need a bucket even for types that
 * the global whitelist drops. Prefix-based fallback covers everything
 * the engine writes today; an unknown type lands in "movement" as a
 * neutral default rather than being silently swallowed. */
function categoriseForScoring(signalType: string): Category {
  const fromMap = SIGNAL_CATEGORY[signalType];
  if (fromMap) return fromMap;
  if (signalType.startsWith("social_")) return "social";
  if (signalType.startsWith("hiring_")) return "hiring";
  if (signalType.startsWith("security_team")) return "hiring";
  if (signalType.includes("breach") || signalType.includes("incident")) return "breach";
  return "movement";
}

const CHIPS: Array<{ id: Category | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "breach", label: "Breach" },
  { id: "movement", label: "Movement" },
  { id: "social", label: "Social" },
  { id: "hiring", label: "Hiring" },
];

const CATEGORY_TONE: Record<Category, string> = {
  breach: "border-red-400/40 bg-red-400/10 text-red-300",
  movement: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  social: "border-violet-400/40 bg-violet-400/10 text-violet-300",
  hiring: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  other: "border-border-default bg-bg-elevated text-text-secondary",
};

const CATEGORY_LABEL: Record<Category, string> = {
  breach: "Breach",
  movement: "Movement",
  social: "Social",
  hiring: "Hiring",
  other: "Update",
};

const CATEGORY_ORDER: Record<Category, number> = {
  breach: 0,
  movement: 1,
  social: 2,
  hiring: 3,
  other: 4,
};

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// Inline lookup of companies by id — needed to resolve account names
// for company-keyed signals (the new social_* rows). Falls back to
// matching via domain when present.
function useCompaniesByIds(ids: string[]) {
  const { orgId } = useOrg();
  const uniqueIds = useMemo(() => [...new Set(ids)].filter(Boolean), [ids]);
  return useQuery({
    queryKey: ["companies_by_ids", orgId, uniqueIds.slice().sort()],
    enabled: uniqueIds.length > 0,
    queryFn: async () => {
      const sb = createSupabaseBrowserClient();
      const { data, error } = await sb
        .from("companies")
        .select("id, name, domain")
        .in("id", uniqueIds);
      if (error) throw error;
      const map = new Map<string, { name: string | null; domain: string | null }>();
      for (const c of (data ?? []) as Array<{ id: string; name: string | null; domain: string | null }>) {
        map.set(c.id, { name: c.name, domain: c.domain });
      }
      return map;
    },
    staleTime: 60_000,
  });
}

export function UnifiedTimeline() {
  const [active, setActive] = useState<Category | "all">("all");
  const { features } = useOrg();
  const ranking = !!features.signal_ranking;

  const { data: signals, isLoading: sLoad } = useSignals();
  // Scored hook is gated by features.signal_ranking inside the hook,
  // so when ranking is off it just returns an idle query with no data.
  const { data: scoredSignals, isLoading: scoredLoad } = useScoredSignals({ sinceDays: 7 });
  const { data: leads, isLoading: lLoad } = useLeads();
  const { data: watchlist, isLoading: wLoad } = useWatchlist();
  const { data: watchlistAlerts, isLoading: waLoad } = useWatchlistAlerts();

  // Pick the source of truth for the signals loop. When the org has
  // priorities populated, the scored RPC drives the feed — already
  // sorted by relevance, already filtered to weight > 0 via the
  // priorities map. Otherwise fall through to the raw signals with
  // the global sales-lens whitelist (unchanged).
  const signalsSource: Array<Signal | ScoredSignal> =
    ranking ? (scoredSignals ?? []) : (signals ?? []);

  // Collect company_ids referenced by signals so we can resolve names
  // for the company-keyed rows (the new social_* signals). Pull from
  // whichever source is active so the lookup batch matches what we'll
  // actually render.
  const companyIdsInSignals = useMemo(() => {
    const ids: string[] = [];
    for (const s of signalsSource) {
      const cid = (s as { company_id?: string | null }).company_id;
      if (cid) ids.push(cid);
    }
    return ids;
  }, [signalsSource]);
  const { data: companyById } = useCompaniesByIds(companyIdsInSignals);

  const leadsById = useMemo(() => {
    const m = new Map<string, { name: string; company_domain: string | null }>();
    for (const l of leads ?? []) {
      const name = l.company_name || [l.first_name, l.last_name].filter(Boolean).join(" ") || l.email || "";
      m.set(l.id, {
        name,
        company_domain: (l as unknown as { company_domain?: string | null }).company_domain ?? null,
      });
    }
    return m;
  }, [leads]);

  const watchlistByDomain = useMemo(() => {
    const m = new Map<string, { name: string; domain: string }>();
    for (const w of watchlist ?? []) {
      if (!w.company_domain) continue;
      m.set(w.company_domain.toLowerCase(), {
        name: w.company_name ?? w.company_domain,
        domain: w.company_domain,
      });
    }
    return m;
  }, [watchlist]);

  const watchlistById = useMemo(() => {
    const m = new Map<string, { name: string; domain: string | null }>();
    for (const w of watchlist ?? []) {
      m.set(w.id, {
        name: w.company_name ?? w.company_domain ?? "",
        domain: w.company_domain ?? null,
      });
    }
    return m;
  }, [watchlist]);

  const items = useMemo<FeedItem[]>(() => {
    const since = Date.now() - SEVEN_DAYS_MS;
    const out: FeedItem[] = [];

    // ---- Signals ----
    // Two paths share this loop:
    //   - Ranking on (org has signal_priorities): scoredSignals are
    //     already filtered to weight>0 and sorted by score DESC server-
    //     side. We categorise permissively so every type the client
    //     opted in to gets a visual bucket.
    //   - Ranking off: raw signals filtered through the strict
    //     opener-worthy SIGNAL_CATEGORY whitelist (the global default).
    for (const s of signalsSource) {
      if (!s.detected_at) continue;
      if (new Date(s.detected_at).getTime() < since) continue;

      const category = ranking
        ? categoriseForScoring(s.signal_type)
        : SIGNAL_CATEGORY[s.signal_type];
      if (!category) continue;

      // Resolve account name + domain
      const sAny = s as {
        company_id?: string | null;
        lead_id?: string | null;
      };
      let account = "";
      let accountDomain: string | null = null;
      if (sAny.company_id && companyById?.has(sAny.company_id)) {
        const c = companyById.get(sAny.company_id)!;
        account = c.name ?? "";
        accountDomain = c.domain ?? null;
      } else if (sAny.lead_id && leadsById.has(sAny.lead_id)) {
        const l = leadsById.get(sAny.lead_id)!;
        account = l.name;
        accountDomain = l.company_domain;
      }
      if (!account) continue; // can't render without an account

      // Headline: prefer the engine's quoted_excerpt / summary /
      // headline. Engine writes these for social_* rows; older rows
      // use signal_data.headline / detail.
      const data = (s.signal_data ?? {}) as Record<string, unknown>;
      const headline = (
        str(data.quoted_excerpt) ||
        str(data.headline) ||
        str(data.detail) ||
        str(data.summary) ||
        s.signal_type
      ).trim();

      // 6-month freshness gate: PL ships historical news (e.g. 2023
      // acquisitions) with a fresh detected_at because PL.date is the
      // crawl date, not the event date. Drop anything whose headline
      // is anchored to a past calendar year. See signalFreshness.ts.
      if (isStaleByHeadline(headline, s.signal_type)) continue;

      const score = (s as { vera_score?: number }).vera_score;
      out.push({
        id: `signal:${s.id}`,
        category,
        account,
        accountDomain,
        headline: scrubBackendNames(headline),
        detectedAt: s.detected_at,
        sourceUrl: str(data.url) || null,
        score: typeof score === "number" ? score : undefined,
      });
    }

    // ---- Watchlist alerts (engine change detector) ----
    // Same sales-lens whitelist as signals: only opener-worthy alert
    // types make it through. Generic "product_launch" / "partnership"
    // / "expansion" alerts get dropped — those don't give a rep a
    // reason to call. Anything not matched is skipped entirely.
    for (const a of watchlistAlerts ?? []) {
      if (!a.detected_at) continue;
      if (new Date(a.detected_at).getTime() < since) continue;
      if (!a.watchlist_id) continue;
      const wl = watchlistById.get(a.watchlist_id);
      if (!wl) continue;
      const t = (a.alert_type ?? "").toLowerCase();
      let category: Category | null = null;
      if (t.includes("breach") || t.includes("cve") || t.includes("incident")) {
        category = "breach";
      } else if (t.includes("leadership") || t.includes("ciso") || t.includes("cto")) {
        category = "movement";
      } else if (t.includes("funding") || t.includes("acquisition") || t.includes("acquired")) {
        category = "movement";
      } else if (t.includes("hiring_security") || t.includes("security_team") || t.includes("hiring_grc")) {
        category = "hiring";
      }
      if (!category) continue;
      const alertHeadline = a.alert_title ?? a.alert_summary ?? "Update detected";
      if (isStaleByHeadline(alertHeadline)) continue;
      out.push({
        id: `alert:${a.id}`,
        category,
        account: wl.name,
        accountDomain: wl.domain,
        headline: scrubBackendNames(alertHeadline),
        detectedAt: a.detected_at,
        sourceUrl: null,
      });
    }

    // NOTE: threat_alerts are deliberately NOT pulled into this timeline.
    // Org-level threat_intel rows (generic CVE
    // catalogues, anniversary news, sector editorials) were dominating
    // "What's new on your watchlist" because they sort under the breach
    // category but have no account attribution. CVEs that actually hit
    // a watched account's stack already live on companies.threat_alerts
    // (jsonb) and surface on the account dossier — no parallel home
    // needed here. If a future engine pass writes per-account threat
    // signals (signals row with company_id + signal_type='breach_proximity'
    // etc), those flow in via the signals loop above.

    // Dedupe: the smart-monitor re-detects the same event on each
    // pass (e.g. "2 critical CVEs in stack" written today AND
    // yesterday), so we'd see Berkshire Hathaway twice with identical
    // wording. Collapse on account + category + first 80 chars of the
    // (lowercased, whitespace-collapsed) headline; keep the most
    // recent. Engine-side dedupe is the proper fix — this is the
    // belt-and-braces.
    const seen = new Map<string, FeedItem>();
    for (const item of out) {
      const key = [
        (item.accountDomain ?? item.account).toLowerCase(),
        item.category,
        item.headline.toLowerCase().replace(/\s+/g, " ").slice(0, 80),
      ].join("|");
      const existing = seen.get(key);
      if (!existing || (item.detectedAt > existing.detectedAt)) {
        seen.set(key, item);
      }
    }
    const deduped = Array.from(seen.values());

    // Sort: when scoring is on, rank purely by per-client relevance
    // score (already accounts for type weight × strength × decay ×
    // fit). When off, fall back to the legacy urgency-then-recency
    // bucket sort.
    if (ranking) {
      deduped.sort((a, b) => {
        const sa = a.score ?? 0;
        const sb = b.score ?? 0;
        if (sa !== sb) return sb - sa;
        return (b.detectedAt || "").localeCompare(a.detectedAt || "");
      });
    } else {
      deduped.sort((a, b) => {
        const ord = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
        if (ord !== 0) return ord;
        return (b.detectedAt || "").localeCompare(a.detectedAt || "");
      });
    }

    return deduped.slice(0, MAX_ROWS);
  }, [signalsSource, ranking, watchlistAlerts, companyById, leadsById, watchlistById]);

  const filtered = useMemo(() => {
    if (active === "all") return items;
    return items.filter((i) => i.category === active);
  }, [items, active]);

  const counts = useMemo(() => {
    const c: Record<Category | "all", number> = {
      all: items.length,
      breach: 0,
      movement: 0,
      social: 0,
      hiring: 0,
      other: 0,
    };
    for (const i of items) c[i.category]++;
    return c;
  }, [items]);

  const loading = (ranking ? scoredLoad : sLoad) || lLoad || wLoad || waLoad;

  return (
    <Card delay={0.05} className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-border-subtle p-6 md:p-7">
        <SectionHeader
          title="What's new today"
          subtitle="Last 7 days across your watchlist. Click any row to open the account."
        />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-6 py-3 md:px-7">
        {CHIPS.map((chip) => {
          const isActive = active === chip.id;
          const count = counts[chip.id as Category | "all"] ?? 0;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => setActive(chip.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] transition-colors",
                isActive
                  ? "border-accent/40 bg-accent/10 text-text-primary"
                  : "border-border-default bg-bg-elevated/40 text-text-secondary hover:border-border-strong",
              )}
            >
              {chip.label}
              <span className="font-mono text-[10px] tabular-nums text-text-muted">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2 p-6 md:p-7">
          {[0, 1, 2].map((i) => (
            <Shimmer key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Activity size={16} strokeWidth={1.6} />}
          title="Nothing to show"
          body={
            active === "all"
              ? "No events on the watchlist in the last 7 days."
              : `No ${CATEGORY_LABEL[active as Category].toLowerCase()} events in the last 7 days.`
          }
        />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {filtered.map((item) => (
            <TimelineRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function TimelineRow({ item }: { item: FeedItem }) {
  const tone = CATEGORY_TONE[item.category];
  const Icon = item.category === "breach"
    ? ShieldAlert
    : item.category === "movement"
    ? TrendingUp
    : item.category === "social"
    ? MessageSquare
    : item.category === "hiring"
    ? Users
    : Activity;

  // If we have a domain, click-through lands the rep on the account page.
  // Otherwise (threat-intel rows have no domain), fall back to the
  // source URL if present.
  const href = item.accountDomain
    ? `/dashboard/accounts/${encodeURIComponent(item.accountDomain)}`
    : item.sourceUrl ?? null;

  const inner = (
    <div className="flex items-start gap-3 px-6 py-3.5 md:px-7">
      <span
        className={cn(
          "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] inline-flex items-center gap-1",
          tone,
        )}
      >
        <Icon size={10} strokeWidth={1.7} aria-hidden />
        {CATEGORY_LABEL[item.category]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[13px] font-medium text-text-primary">
            {item.account}
          </span>
          <span className="shrink-0 text-[11px] text-text-muted">
            <RelativeTime value={item.detectedAt} />
          </span>
        </div>
        <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-text-secondary">
          {item.headline}
        </div>
      </div>
      {item.sourceUrl && (
        <ExternalLink
          size={11}
          strokeWidth={1.7}
          className="mt-1 shrink-0 text-text-muted"
          aria-hidden
        />
      )}
    </div>
  );

  if (href && href.startsWith("/")) {
    return (
      <li className="hover:bg-bg-elevated/40">
        <Link href={href} className="block">
          {inner}
        </Link>
      </li>
    );
  }
  if (href) {
    return (
      <li className="hover:bg-bg-elevated/40">
        <a href={href} target="_blank" rel="noopener noreferrer" className="block">
          {inner}
        </a>
      </li>
    );
  }
  return <li>{inner}</li>;
}
