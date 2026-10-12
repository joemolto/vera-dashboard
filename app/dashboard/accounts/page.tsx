"use client";

import { useMemo, useState } from "react";
import { notFound } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Building2 } from "lucide-react";
import { useOrg } from "@/components/dashboard/OrgContext";
import {
  Card,
  EmptyState,
  PageHeader,
  PageShell,
  Pill,
  SectionHeader,
} from "@/components/dashboard/primitives";
import {
  AccountRow,
  AccountRowSkeleton,
  AccountTableHeader,
  type AccountRowData,
  type CredentialExposureSummary,
} from "@/components/dashboard/widgets/AccountRow";
import { AccountPeopleDrawer } from "@/components/dashboard/widgets/AccountPeopleDrawer";
import { ExportAccountsButton } from "@/components/dashboard/widgets/ExportAccountsButton";
import { AccountDrawer } from "@/components/dashboard/widgets/AccountDrawer";
import { PeopleView, isAcquiredPerson } from "@/components/dashboard/widgets/PeopleView";
import { SoloCapBar } from "@/components/dashboard/widgets/SoloCapBar";
import {
  ViewToggle,
  VIEW_ICONS,
  type ViewOption,
} from "@/components/dashboard/widgets/ViewToggle";
import {
  deriveCveSummary,
  deriveIntent,
  deriveRevenue,
} from "@/lib/dashboard/cyberIntent";
import { deriveAccountViz } from "@/lib/dashboard/accountViz";
import {
  MarketFilterPills,
  useMarketDomains,
  useMarketFilter,
} from "@/lib/dashboard/marketFilter";
import { deriveAccountScore } from "@/lib/dashboard/accountScore";
import { hiddenSignalTypes, isRelevantSocial } from "@/lib/dashboard/buyingTriggers";
import { isStaleByHeadline } from "@/lib/dashboard/signalFreshness";
import {
  estimateAccountPotential,
  formatPotential,
} from "@/lib/dashboard/accountRevenuePotential";
import { summariseAccountSignals } from "@/lib/dashboard/accountSignals";
import {
  ALL_CATEGORY_KEYS,
  type SignalCategory,
} from "@/lib/dashboard/signalCategories";
import {
  useDealBaseline,
  useAccountScores,
  useSecurityJobs,
  useLeads,
  useMyUnlocks,
  useWatchlist,
  useWatchlistAlerts,
  useUsage,
  useVisibleSignalCategories,
} from "@/lib/dashboard/queries";
import { buildSecurityContactMap, pickDiscoveredContact } from "@/lib/dashboard/securityContact";
import { SuggestedAccounts } from "@/components/dashboard/widgets/SuggestedAccounts";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { SELF_HOSTED } from "@/lib/selfHosted";

// ---------------------------------------------------------------------------
// Bulk-companies-by-domain hook. Skips the per-domain N+1 vs calling
// useCompanyIntelligence per row. Returns a domain -> CompanyMeta map.
// ---------------------------------------------------------------------------

interface CompanyMeta {
  id?: string;
  domain: string;
  name: string | null;
  industry: string | null;
  hq_country: string | null;
  size_band: string | null;
  linkedin_url: string | null;
  technologies: unknown[];
  last_enriched_at: string | null;
  apollo_data: unknown;
  deep_research_data: unknown;
  threat_alerts: unknown;
  /** Cyber lens v1 — composite + per-axis score (account_profile_scorer.py).
   *  Only `composite` is read at the table level; the rest renders on the
   *  dossier. Null on accounts whose monitor pass hasn't yet computed it. */
  profile_score: { composite: number | null } | null;
  /** LeakRadar stealer-log / dark-web exposure summary. Null until the
   *  first credential-exposure check runs for the domain. */
  credential_exposure: CredentialExposureSummary | null;
  /** Discovered buying-committee contacts (person-intel discovery). Used as
   *  the Key Contact fallback when no unlocked security lead exists. */
  key_contacts: unknown;
}

// ---------------------------------------------------------------------------
// Latest per-org signal per company domain. The signals table is per-lead,
// so we join via leads.company_domain. Pulls the freshest signal per
// domain and exposes signal_type for the "Why now" badge.
// ---------------------------------------------------------------------------

interface LatestSignalRow {
  domain: string;
  headline: string;
  at: string;
  signalType: string | null;
}

interface SignalEvent {
  signal_type: string;
  /** Where the engine pulled the signal from (e.g. `apidirect_reddit_posts`,
   * `predictleads_news_events`). Used here to detect social_listener
   * rows so we can split them into the dedicated Social cell. */
  signal_source: string | null;
  signal_data: Record<string, unknown> | null;
  detected_at: string;
}

interface SignalsByDomain {
  /** Freshest signal per domain — drives the "Latest signal" cell. */
  latest: Record<string, LatestSignalRow>;
  /** All recent signals per domain — drives the Signal Wave (90d). */
  all: Record<string, SignalEvent[]>;
}

/** "Why now" eligibility — STRICT cyber-lens whitelist
 * (2026-06-10). Only signal types with unambiguous cyber-vendor
 * meaning earn a slot. Lower number = higher priority. Anything not
 * listed is dropped — we'd rather render no Why-now than promote
 * generic news ("Someone leaves Some Group") that reads as random to
 * a cyber rep.
 *
 * Notably DROPPED from Why-now (still appear in lens tabs):
 *  - new_leadership: the engine has already stripped security titles
 *    into security_leadership_hire, so every remaining new_leadership
 *    is by definition a non-security exec change. Marketing/sales/
 *    ops leadership churn isn't a cyber buying moment.
 *  - social_leadership_change: same reason.
 *  - social_milestone / new_partnership / product_launch / expansion:
 *    company-positive events but not cyber-pointed.
 *  - social_hiring_buzz / hiring_sales_bd: non-cyber roles.
 *  - Every social_* type except breach_mention and funding_news:
 *    too generic to anchor a cyber Why-now.
 */
const WHY_NOW_RANK: Record<string, number> = {
  // Risk — live cyber exposure
  credential_leak: 0,
  breach_proximity: 0,
  cve_in_stack: 0,
  credential_leak_supply_chain: 1,
  social_breach_mention: 1,
  breach_mention: 1, // PL-news twin of social_breach_mention (2026-07-07)
  // Maturity — cyber-specific capability moves
  security_leadership_hire: 5,
  security_team_expansion: 8,
  hiring_security: 10,
  hiring_grc: 12,
  // Commercial — budget-unlocking events that cyber reps care about
  recently_funded: 15,
  social_funding_news: 16,
  recent_acquisition: 18,
  // A prospect publicly discussing their security vendors — the strongest
  // conversational opener in the data (2026-07-07: 88 rows/90d, avg 1.4k-char
  // payloads) but ranked below hard risk/budget events.
  social_vendor_relationship: 20,
};

/** Signal types at or above this rank are dropped from the "Why now"
 * slot. Set tight so non-listed types (default rank 99) always lose. */
const WHY_NOW_DROP_FROM_RANK = 25;

/** Channel display names for the Social cell popover. Maps the
 * engine's signal_source values to short user-facing labels. */
const CHANNEL_LABEL_BY_SOURCE: Record<string, string> = {
  apidirect_web_search: "Google",
  apidirect_reddit_posts: "Reddit",
  apidirect_reddit_comments: "Reddit comment",
  apidirect_forums: "Forum",
  apidirect_linkedin_company_posts: "LinkedIn",
};

function useSignalsByDomain(
  orgId: string,
  domains: string[],
  hidden: ReadonlySet<string>,
) {
  return useQuery<SignalsByDomain>({
    queryKey: ["signals_by_domain", orgId, [...domains].sort(), hidden.size],
    enabled: !!orgId && domains.length > 0,
    queryFn: async () => {
      const sb = createSupabaseBrowserClient();
      // 1. Resolve BOTH paths so we can union them:
      //    a) leads at any of these domains for this org (lead-keyed signals)
      //    b) companies whose domain is in the set (account-keyed signals
      //       written by the engine's enrich_company_only path — no person
      //       required, the accounts-first paradigm)
      const [leadsResult, companiesResult] = await Promise.all([
        sb
          .from("leads")
          .select("id, company_domain")
          .eq("org_id", orgId)
          .in("company_domain", domains),
        sb
          .from("companies")
          .select("id, domain")
          .in("domain", domains),
      ]);
      const leadDomain: Record<string, string> = {};
      for (const l of leadsResult.data ?? []) {
        if (l.id && l.company_domain) {
          leadDomain[l.id] = l.company_domain.toLowerCase();
        }
      }
      const companyDomain: Record<string, string> = {};
      for (const c of companiesResult.data ?? []) {
        if (c.id && c.domain) {
          companyDomain[c.id] = c.domain.toLowerCase();
        }
      }
      const leadIds = Object.keys(leadDomain);
      const companyIds = Object.keys(companyDomain);
      if (leadIds.length === 0 && companyIds.length === 0) {
        return { latest: {}, all: {} };
      }

      // 2. Pull recent signals via EITHER path (last 90 days). Use the
      //    .or() filter so a single query handles both lead-keyed and
      //    company-keyed rows; this is cheaper than two queries + merge
      //    and avoids double-counting signals that carry both keys.
      const ninetyDaysAgo = new Date(
        Date.now() - 90 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const orClauses: string[] = [];
      if (leadIds.length > 0) orClauses.push(`lead_id.in.(${leadIds.join(",")})`);
      if (companyIds.length > 0) orClauses.push(`company_id.in.(${companyIds.join(",")})`);
      const { data: sigs } = await sb
        .from("signals")
        .select(
          "lead_id, company_id, signal_type, signal_source, signal_data, detected_at",
        )
        .or(orClauses.join(","))
        .gte("detected_at", ninetyDaysAgo)
        .order("detected_at", { ascending: false })
        .limit(1000);

      const latest: Record<string, LatestSignalRow> = {};
      // Track each domain's best signal usefulness rank — so when a
      // higher-value signal arrives later in the loop we can promote
      // it over an already-seen lower-tier one (e.g. drop a Reddit
      // mention in favour of a fresh funding event).
      const latestRank: Record<string, number> = {};
      const all: Record<string, SignalEvent[]> = {};
      const seen = new Set<string>(); // dedupe signals carrying both keys
      for (const s of (sigs ?? []) as Array<{
        lead_id: string | null;
        company_id: string | null;
        signal_type: string;
        signal_source: string | null;
        signal_data: Record<string, unknown> | null;
        detected_at: string;
      }>) {
        // Resolve the domain via whichever key is set. Prefer company
        // when both are present (more direct).
        const dom = s.company_id
          ? companyDomain[s.company_id]
          : (s.lead_id ? leadDomain[s.lead_id] : null);
        if (!dom) continue;
        const dedupKey = `${dom}|${s.signal_type}|${s.detected_at}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        // Weight-0 types are never shown to this org — drop before any
        // why-now ranking or chip building (Phase 1 visibility rule).
        if (hidden.has(s.signal_type)) continue;

        // "Why now" / "Latest signal" — rank by usefulness, not just
        // recency. Consumer-banking Reddit chatter (e.g. a personal
        // finance subreddit thread) was winning
        // the slot over real PL/threat signals because social fires
        // constantly. Filter the lowest tier (social_company_mention)
        // out of this slot entirely.
        const rank = WHY_NOW_RANK[s.signal_type] ?? 99;
        const prevRank = latestRank[dom];
        const isBetter = prevRank === undefined || rank < prevRank;
        if (isBetter && rank < WHY_NOW_DROP_FROM_RANK) {
          const data = (s.signal_data ?? {}) as Record<string, unknown>;
          // For social_* signals, prefer the Haiku-written
          // quoted_excerpt / summary over the raw post title — the
          // title can be SERP cruft like "Username on Subreddit"
          // when the row came from /v1/web/search.
          const isSocial = s.signal_type.startsWith("social_");
          const headline = isSocial
            ? (typeof data.quoted_excerpt === "string" && data.quoted_excerpt) ||
              (typeof data.summary === "string" && data.summary) ||
              (typeof data.headline === "string" && data.headline) ||
              s.signal_type
            : (typeof data.headline === "string" && data.headline) ||
              (typeof data.detail === "string" && data.detail) ||
              s.signal_type;
          // Hard 6-month freshness gate — PL news ships old events
          // (2023 acquisitions etc.) with a fresh detected_at because
          // PL's `date` field is article-crawl-date, not event-date.
          // The actual event date is in the headline text. Skip if so.
          if (isStaleByHeadline(headline, s.signal_type)) continue;
          latest[dom] = {
            domain: dom,
            headline,
            at: s.detected_at,
            signalType: s.signal_type ?? null,
          };
          latestRank[dom] = rank;
        }
        // Same 6-month freshness gate as the "Why now" slot — applies
        // to the per-account signals list used by the Signals column,
        // Social cell, etc. A 2023 PL acquisition shouldn't surface
        // anywhere on the dashboard as a current signal.
        const allData = (s.signal_data ?? {}) as Record<string, unknown>;
        const allHeadline =
          (typeof allData.headline === "string" && allData.headline) ||
          (typeof allData.summary === "string" && allData.summary) ||
          (typeof allData.detail === "string" && allData.detail) ||
          "";
        if (isStaleByHeadline(allHeadline, s.signal_type)) continue;
        (all[dom] = all[dom] ?? []).push({
          signal_type: s.signal_type,
          signal_source: s.signal_source ?? null,
          signal_data: s.signal_data ?? null,
          detected_at: s.detected_at,
        });
      }
      return { latest, all };
    },
    staleTime: 60_000,
  });
}

function useCompaniesByDomain(domains: string[]) {
  return useQuery({
    queryKey: ["companies_by_domain", [...domains].sort()],
    enabled: domains.length > 0,
    queryFn: async () => {
      const sb = createSupabaseBrowserClient();
      const { data, error } = await sb
        .from("companies")
        .select(
          "id, domain, name, industry, hq_country, size_band, linkedin_url, technologies, last_enriched_at, apollo_data, deep_research_data, threat_alerts, profile_score, credential_exposure, key_contacts",
        )
        .in("domain", domains);
      if (error) throw error;
      const byDomain: Record<string, CompanyMeta> = {};
      for (const row of (data ?? []) as CompanyMeta[]) {
        byDomain[row.domain.toLowerCase()] = row;
      }
      return byDomain;
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractStackChips(techStack: unknown[]): string[] {
  if (!Array.isArray(techStack)) return [];
  const names: string[] = [];
  for (const entry of techStack) {
    if (typeof entry === "string") {
      names.push(entry);
    } else if (entry && typeof entry === "object" && "name" in entry) {
      const n = (entry as { name?: unknown }).name;
      if (typeof n === "string") names.push(n);
    }
    if (names.length >= 6) break;
  }
  return names;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AccountsPage() {
  const { features, orgName, orgId, signalPriorities } = useOrg();
  const hiddenTypes = useMemo(
    () => hiddenSignalTypes(signalPriorities),
    [signalPriorities],
  );
  if (!features.accounts_dashboard) {
    notFound();
  }

  const { data: watchlist, isLoading: wLoad } = useWatchlist();
  const { data: leads } = useLeads();
  const { data: alerts } = useWatchlistAlerts();
  const { data: usage } = useUsage();

  // People-drawer state — one drawer mounted at the page level so only
  // one is ever open at a time (Surfe-style "view employees" pattern).
  const [peopleDrawer, setPeopleDrawer] = useState<{
    domain: string;
    name: string;
  } | null>(null);

  // Account-preview drawer state. Clicking a
  // row opens a slide-in preview instead of navigating to the full
  // page. The "View account" button inside the drawer is how the rep
  // gets to the full page when they want more depth.
  const [accountDrawer, setAccountDrawer] = useState<AccountRowData | null>(null);

  // Accounts | People lens toggle (2026-06-11). Same surface, two
  // units of analysis. Replaces the standalone Prospects nav item for
  // orgs on the account-first model.
  // Decoupled-monitoring orgs (pilot) split accounts into Research
  // (snapshot, not monitored) and Monitored (live book). Others keep a
  // single Accounts lens.
  const decoupled = !!features.decoupled_monitoring;
  // Two-level nav (2026-06-20): main tab (Accounts | People) + a shared
  // Monitored | All sub-lens, consistent across both. Solo/decoupled orgs
  // default to the Monitored sub-lens (the active book); the sub persists when
  // switching main tabs.
  const [mainTab, setMainTab] = useState<"accounts" | "people">("accounts");
  const [sub, setSub] = useState<"monitored" | "all">(
    decoupled ? "monitored" : "all",
  );

  // Market filter (multi_market pilot) — scopes accounts AND people via the
  // account's market. Inert (null domains) unless the org has >1 market.
  const marketFilter = useMarketFilter();
  const marketDomains = useMarketDomains(marketFilter.selected, watchlist);

  const domains = useMemo(
    () =>
      (watchlist ?? [])
        .map((w) => (w.company_domain ?? "").toLowerCase())
        .filter(Boolean),
    [watchlist],
  );

  const { data: companiesByDomain } = useCompaniesByDomain(domains);
  const { data: signalsByDomain } = useSignalsByDomain(orgId, domains, hiddenTypes);
  // Per-client relevance score per account (pilot). Empty Map when
  // features.signal_ranking is off, which is the signal to fall back
  // to deriveAccountScore.
  const { data: scoredAccountScores } = useAccountScores({ sinceDays: 30 });
  // Open security/GRC vacancies read from each account's own job board.
  const { data: securityJobsByCompany } = useSecurityJobs(
    Object.values(companiesByDomain ?? {}).map((c) => c?.id),
  );
  const ranking = !!features.signal_ranking;
  const latestSignalByDomain = signalsByDomain?.latest;
  const allSignalsByDomain = signalsByDomain?.all;
  const { data: dealBaseline } = useDealBaseline();
  const { data: visibleCategoriesPref } = useVisibleSignalCategories();
  // Resolve to a stable Set. Null/undefined preference means "show all"
  // — keeps existing customers seeing all chips until they customise.
  const visibleCategories = useMemo<ReadonlySet<SignalCategory>>(() => {
    const list = visibleCategoriesPref ?? ALL_CATEGORY_KEYS;
    return new Set(list as SignalCategory[]);
  }, [visibleCategoriesPref]);

  // Group alerts by watchlist_id; take the freshest per group.
  const latestAlertByWatchlistId = useMemo(() => {
    const out: Record<
      string,
      { headline: string; at: string; alertType: string | null }
    > = {};
    for (const a of alerts ?? []) {
      if (!a.watchlist_id || !a.detected_at) continue;
      const existing = out[a.watchlist_id];
      if (!existing || a.detected_at > existing.at) {
        out[a.watchlist_id] = {
          headline: a.alert_title ?? a.alert_summary ?? "",
          at: a.detected_at,
          alertType: a.alert_type ?? null,
        };
      }
    }
    return out;
  }, [alerts]);

  const secByDomain = useMemo(() => buildSecurityContactMap(leads), [leads]);
  // This org's unlock records (apollo_people_cache) — the Key Contact
  // column derives unlocked/lead_id/email from here, never from the
  // global key_contacts entries.
  const myUnlocks = useMyUnlocks();
  const unlocksByApolloId = useMemo(
    () =>
      new Map(
        (myUnlocks.data ?? []).map((u) => [
          u.apollo_id,
          { lead_id: u.lead_id, email: u.email },
        ]),
      ),
    [myUnlocks.data],
  );

  const rows: AccountRowData[] = useMemo(() => {
    return (watchlist ?? []).map((w) => {
      const domLc = (w.company_domain ?? "").toLowerCase();
      const meta = companiesByDomain?.[domLc];
      const wlAlert = latestAlertByWatchlistId[w.id];
      const sig = latestSignalByDomain?.[domLc];

      // Pick the freshest of (watchlist_alert, signal) — signals are
      // generated by the engine's enrichment pipeline; watchlist_alerts
      // by the watchlist monitor. Either is valid "latest activity".
      let bestHeadline: string | null = null;
      let bestAt: string | null = null;
      let bestSignalType: string | null = null;
      let bestAlertType: string | null = null;
      if (sig && (!wlAlert || sig.at > wlAlert.at)) {
        bestHeadline = sig.headline;
        bestAt = sig.at;
        bestSignalType = sig.signalType;
      } else if (wlAlert) {
        bestHeadline = wlAlert.headline;
        bestAt = wlAlert.at;
        bestAlertType = wlAlert.alertType;
      }

      const domainSignals = allSignalsByDomain?.[domLc] ?? [];

      // ---- Revenue potential (per-account) --------------------------------
      // Skip entirely if the org has no average_deal_size baseline — keeps
      // the column org-agnostic (column hides itself across the table when
      // no row has a potential).
      const cveCount = Array.isArray(meta?.threat_alerts)
        ? meta!.threat_alerts.length
        : 0;
      const growthCount = domainSignals.filter((s) =>
        [
          "recently_funded",
          "recent_acquisition",
          "expansion",
          "new_partnership",
          "product_launch",
          "security_team_expansion",
          "hiring_sales_bd",
          "new_leadership",
          "security_leadership_hire",
        ].includes(s.signal_type),
      ).length;
      const potentialResult =
        dealBaseline?.averageDealSize
          ? estimateAccountPotential({
              baseline: dealBaseline.averageDealSize,
              currency: dealBaseline.currency,
              highValueSegments: dealBaseline.highValueSegments,
              lowValueSegments: dealBaseline.lowValueSegments,
              enterpriseThresholdEmployees:
                dealBaseline.enterpriseThresholdEmployees,
              minDeal: dealBaseline.minDeal,
              maxDeal: dealBaseline.maxDeal,
              sizeBand: meta?.size_band ?? null,
              industry: meta?.industry ?? null,
              signalCount: domainSignals.length,
              growthSignalCount: growthCount,
              cyberFindingCount: cveCount,
            })
          : null;

      const potential = potentialResult
        ? formatPotential(potentialResult.estimate, potentialResult.currency)
        : null;

      const cveSummary = deriveCveSummary(meta?.threat_alerts ?? null);
      // Score: when this org has signal_ranking enabled, derive the
      // account score from the per-client weighted sum of signal
      // scores. Normalise to 0..100 (clip sums above ~3.3 to 100 —
      // about the threshold where an account has multiple high-weight
      // recent signals at full strength). Otherwise fall back to the
      // global deriveAccountScore heuristic.
      const score = ranking
        ? Math.min(
            100,
            Math.round((scoredAccountScores?.get(domLc)?.score ?? 0) * 30),
          )
        : deriveAccountScore({
            latestSignalAt: bestAt,
            signalCount90d: domainSignals.length,
            growthSignalCount: growthCount,
            kevCount: cveSummary.kev,
            totalCves: cveSummary.total,
          });

      // Chip summary for the Signals column. Reads the org's
      // visible_signal_categories preference; null falls back to ALL
      // categories (default behaviour for orgs that haven't customised).
      const threatAlertsForChips = Array.isArray(meta?.threat_alerts)
        ? (meta!.threat_alerts as Array<{
            severity?: string;
            is_actively_exploited?: boolean;
            title?: string;
          }>)
        : null;
      const summary = summariseAccountSignals(
        domainSignals,
        threatAlertsForChips,
        visibleCategories,
        3,
      );

      // Social signals — the per-account social_listener output. Filtered
      // here from the same domainSignals pool so we don't need a second
      // DB call. Empty for accounts without social coverage; the cell
      // renders as "—" in that case.
      const socialSignals = domainSignals
        .filter(
          (s) =>
            // Only B2B-relevant social surfaces — breach / funding /
            // leadership / milestone / vendor / security-hiring. Generic
            // mentions, complaints, reviews, employee chatter and
            // first-party posts are noise and excluded (2026-06-11).
            isRelevantSocial(s.signal_type) &&
            (s.signal_source ?? "").startsWith("apidirect_"),
        )
        .map((s) => {
          const data = (s.signal_data ?? {}) as Record<string, unknown>;
          const excerpt =
            (typeof data.quoted_excerpt === "string" && data.quoted_excerpt) ||
            (typeof data.headline === "string" && data.headline) ||
            "";
          const summary =
            typeof data.summary === "string" ? data.summary : "";
          const channelRaw = (s.signal_source ?? "").replace(
            /^apidirect_/,
            "",
          );
          const channel = CHANNEL_LABEL_BY_SOURCE[s.signal_source ?? ""] ?? channelRaw;
          const url = typeof data.url === "string" ? data.url : "";
          return {
            signal_type: s.signal_type,
            excerpt,
            summary,
            channel,
            url,
            detected_at: s.detected_at,
          };
        });

      return {
        domain: w.company_domain ?? "",
        name: meta?.name || w.company_name || w.company_domain || "(no name)",
        industry: meta?.industry ?? null,
        country: meta?.hq_country ?? null,
        size_band: meta?.size_band ?? null,
        stack: meta ? extractStackChips(meta.technologies) : [],
        intent: deriveIntent({
          signalType: bestSignalType,
          alertType: bestAlertType,
        }),
        viz: deriveAccountViz(
          domLc,
          meta
            ? {
                technologies: meta.technologies,
                threat_alerts: meta.threat_alerts,
              }
            : undefined,
          domainSignals,
        ),
        revenue: deriveRevenue({
          deep_research_data: meta?.deep_research_data ?? null,
          apollo_data: meta?.apollo_data ?? null,
        }),
        potential,
        profile_composite:
          typeof meta?.profile_score?.composite === "number"
            ? meta.profile_score.composite
            : null,
        // null (not 0) until we've actually read their board: "unknown" and
        // "not hiring" must stay distinguishable in the column.
        security_jobs: meta?.id
          ? securityJobsByCompany?.get(meta.id)?.length ?? 0
          : null,
        cves: cveSummary,
        credential_exposure: meta?.credential_exposure ?? null,
        latest_signal_headline: bestHeadline,
        latest_signal_at: bestAt,
        watching_since: (w as { created_at?: string | null }).created_at ?? null,
        // "Last checked": when Vera last looked at this account. Weekly
        // monitor passes stamp last_monitored_at; the deep-enrichment
        // timestamp is the fallback for rows whose first pass hasn't run.
        // (The old "Enriched" column showed last_enriched_at, which only
        // moves when the profile CHANGES — read as "ignored for 22 days"
        // by users while the monitor ran days ago.)
        last_checked_at:
          (w as { last_monitored_at?: string | null }).last_monitored_at ??
          meta?.last_enriched_at ??
          null,
        last_enriched_at: meta?.last_enriched_at ?? null,
        score,
        signal_chips: summary.chips,
        signal_more: summary.more_count,
        signal_more_labels: summary.more_labels,
        social_signals: socialSignals,
        linkedin_url: meta?.linkedin_url ?? null,
        company_id: meta?.id ?? null,
        watchlist_id: w.id,
        monitoring_active: w.monitoring_active ?? true,
        next_monitor_at: w.next_monitor_at ?? null,
        security_contact:
          secByDomain.get(domLc) ??
          pickDiscoveredContact(meta?.key_contacts, unlocksByApolloId) ??
          null,
      };
    });
  }, [
    secByDomain,
    unlocksByApolloId,
    watchlist,
    companiesByDomain,
    latestAlertByWatchlistId,
    latestSignalByDomain,
    allSignalsByDomain,
    dealBaseline,
    visibleCategories,
    ranking,
    scoredAccountScores,
    securityJobsByCompany,
  ]);

  const creditsLeft = usage?.remaining ?? null;

  // Filter state — chips above the table. Empty set = show all.
  // Temperature thresholds mirror AccountRow.deriveTemperature so the
  // filter and the dot stay in lockstep.
  type TempFilter = "hot" | "warm" | "cold";
  const [activeTemps, setActiveTemps] = useState<Set<TempFilter>>(new Set());

  function rowTemp(latestSignalAt: string | null): TempFilter {
    if (!latestSignalAt) return "cold";
    const days =
      (Date.now() - new Date(latestSignalAt).getTime()) / 86_400_000;
    if (days < 7) return "hot";
    if (days < 30) return "warm";
    return "cold";
  }

  // Market filter applies at the base so the heat banner, lens counts and
  // the table all narrow together. No-op (same array) when inactive.
  const marketRows = useMemo(
    () => (marketDomains ? rows.filter((r) => marketDomains.has(r.domain)) : rows),
    [rows, marketDomains],
  );

  // Sort: score desc, ties broken by signal recency. Surface the
  // best-of-list at the top so a rep doesn't have to scroll past
  // dormant accounts to find the live ones.
  const sortedRows = useMemo(() => {
    return [...marketRows].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const at = a.latest_signal_at ? Date.parse(a.latest_signal_at) : 0;
      const bt = b.latest_signal_at ? Date.parse(b.latest_signal_at) : 0;
      return bt - at;
    });
  }, [marketRows]);

  // Monitored accounts = the watched subset. 'All' = every account (the old
  // Research lens folds into All; each row's Monitor pill shows its state).
  const monitoredRows = useMemo(
    () => sortedRows.filter((r) => r.monitoring_active),
    [sortedRows],
  );

  // The rows feeding the table = the current accounts sub-lens.
  const lensRows = sub === "monitored" ? monitoredRows : sortedRows;

  const filteredRows = useMemo(() => {
    if (activeTemps.size === 0) return lensRows;
    return lensRows.filter((r) => activeTemps.has(rowTemp(r.latest_signal_at)));
  }, [lensRows, activeTemps]);

  // People counts for the sub-lens chips (acquired = unlocked/enriched).
  // People follow their account's market when the filter is active.
  const acquiredPeople = useMemo(
    () =>
      (leads ?? [])
        .filter(isAcquiredPerson)
        .filter(
          (l) =>
            !marketDomains ||
            marketDomains.has((l.company_domain ?? "").toLowerCase()),
        ),
    [leads, marketDomains],
  );
  const monitoredPeopleCount = useMemo(
    () => acquiredPeople.filter((l) => l.person_monitoring).length,
    [acquiredPeople],
  );

  // Two-level nav: main tab (Accounts | People) + a shared Monitored | All
  // sub-lens, identical on both for consistency.
  const mainOptions: ViewOption[] = [
    { key: "accounts", label: "Accounts", Icon: VIEW_ICONS.accounts },
    { key: "people", label: "People", Icon: VIEW_ICONS.people },
  ];
  const subOptions: ViewOption[] =
    mainTab === "accounts"
      ? [
          { key: "monitored", label: "Monitored", Icon: VIEW_ICONS.monitored, count: monitoredRows.length },
          { key: "all", label: "All", Icon: VIEW_ICONS.all, count: sortedRows.length },
        ]
      : [
          { key: "monitored", label: "Monitored", Icon: VIEW_ICONS.monitored, count: monitoredPeopleCount },
          { key: "all", label: "All", Icon: VIEW_ICONS.all, count: acquiredPeople.length },
        ];

  // Heat banner counts — informational header above the table.
  // Plain factual framing ("8 accounts with fresh signal") rather than
  // marketing speak ("companies you should reach out to"). Counts use
  // the same temperature thresholds as the row (hot < 7d, warm < 30d).
  const heat = useMemo(() => {
    let hot = 0;
    let warm = 0;
    let cold = 0;
    for (const r of marketRows) {
      const t = rowTemp(r.latest_signal_at);
      if (t === "hot") hot += 1;
      else if (t === "warm") warm += 1;
      else cold += 1;
    }
    return { hot, warm, cold, total: marketRows.length };
  }, [marketRows]);

  function toggleTemp(t: TempFilter) {
    setActiveTemps((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow={orgName || "Intelligence"}
        title={
          mainTab === "people"
            ? sub === "monitored"
              ? "Monitored people"
              : "Your people"
            : sub === "monitored"
              ? "Monitored accounts"
              : "Your accounts"
        }
        right={
          <div className="flex items-center gap-2">
            {!SELF_HOSTED && !features.solo_plan && creditsLeft !== null && (
              <Pill variant="muted">
                {creditsLeft.toLocaleString()} credits left
              </Pill>
            )}
            <ExportAccountsButton orgId={orgId} />
          </div>
        }
      />

      {!SELF_HOSTED && <SoloCapBar />}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <ViewToggle
          value={mainTab}
          onChange={(v) => setMainTab(v as "accounts" | "people")}
          options={mainOptions}
        />
        <ViewToggle
          value={sub}
          onChange={(v) => setSub(v as "monitored" | "all")}
          options={subOptions}
        />
        {marketFilter.enabled && (
          <MarketFilterPills
            markets={marketFilter.markets}
            filterId={marketFilter.filterId}
            onChange={marketFilter.setFilterId}
          />
        )}
      </div>

      {/* Lens hint — the Monitored sub-lens, for accounts + people. */}
      {mainTab === "accounts" && sub === "monitored" && (
        <p className="mt-3 text-[12px] text-text-muted">
          {features.solo_plan ? (
            <>
              Vera is watching these — checked every week for new signals.{" "}
              {monitoredRows.length > 0 && (
                <span className="text-text-secondary">
                  {monitoredRows.length} watched.
                </span>
              )}{" "}
              Pause any from its row or panel.
            </>
          ) : (
            <>
              Vera is watching these for changes — about 4 credits each per
              month.{" "}
              {monitoredRows.length > 0 && (
                <span className="text-text-secondary">
                  {monitoredRows.length} watched · ~
                  {monitoredRows.length * 4} credits/mo.
                </span>
              )}{" "}
              Pause any from its row or panel.
            </>
          )}
        </p>
      )}
      {mainTab === "people" && sub === "monitored" && monitoredPeopleCount > 0 && (
        <p className="mt-3 text-[12px] text-text-muted">
          Vera is watching{" "}
          <span className="text-text-secondary">
            {monitoredPeopleCount}{" "}
            {monitoredPeopleCount === 1 ? "person" : "people"}
          </span>{" "}
          — checked weekly for role changes, posts and competitor activity.
          Stop any from its row.
        </p>
      )}

      {mainTab === "people" ? (
        <PeopleView filter={sub} allowedDomains={marketDomains} />
      ) : (
      <>
      {/* Heat banner — quick scan of where attention should go today.
          Subtle accent treatment so it reads as informational, not
          decorative. */}
      {!wLoad && rows.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/15 bg-accent/[0.03] px-4 py-3">
          <div className="text-[13px] text-text-primary">
            {heat.hot > 0 ? (
              <>
                <span className="font-medium">
                  {heat.hot} hot account{heat.hot === 1 ? "" : "s"}
                </span>{" "}
                <span className="text-text-secondary">
                  — fresh signal in the last 7 days
                </span>
              </>
            ) : (
              <span className="text-text-secondary">
                No fresh activity in the last 7 days
              </span>
            )}
          </div>
          <div className="text-[11px] text-text-muted">
            {heat.total} watched · {heat.warm} with signal in last 30 days
          </div>
        </div>
      )}

      {/* Filter chips — quick temperature filters. Click to toggle, click
          active chip to clear. Counts come from the unfiltered set so the
          chip label tells you what's available, not what's currently shown. */}
      {!wLoad && rows.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-text-muted">
            Filter
          </span>
          {(
            [
              { key: "hot" as const, label: "Hot", count: heat.hot, dot: "bg-orange-400" },
              { key: "warm" as const, label: "Warm", count: heat.warm, dot: "bg-amber-400" },
              { key: "cold" as const, label: "Cold", count: heat.cold, dot: "bg-text-muted/60" },
            ]
          ).map((f) => {
            const active = activeTemps.has(f.key);
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => toggleTemp(f.key)}
                className={[
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
                  active
                    ? "border-accent/50 bg-accent/10 text-text-primary"
                    : "border-border-default text-text-secondary hover:border-accent/30 hover:text-text-primary",
                ].join(" ")}
                aria-pressed={active}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${f.dot}`} aria-hidden />
                {f.label}
                <span className="font-mono text-[10.5px] text-text-muted">
                  {f.count}
                </span>
              </button>
            );
          })}
          {activeTemps.size > 0 && (
            <button
              type="button"
              onClick={() => setActiveTemps(new Set())}
              className="text-[11.5px] text-text-muted underline-offset-2 hover:text-text-secondary hover:underline"
            >
              Clear
            </button>
          )}
          <span className="ml-auto text-[11px] text-text-muted">
            Sorted by score · highest first
          </span>
        </div>
      )}

      <div className="mt-4">
        {wLoad ? (
          <div className="overflow-x-auto rounded-2xl border border-border-default bg-bg-card">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <AccountRowSkeleton key={i} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Building2 size={16} strokeWidth={1.6} />}
            title="No accounts yet"
            body="Accounts will appear here once they're added."
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border-default bg-bg-card">
            <AccountTableHeader />
            {filteredRows.length === 0 ? (
              <div className="px-5 py-10 text-center text-[12.5px] text-text-muted">
                {activeTemps.size > 0
                  ? "No accounts match the current filter."
                  : sub === "monitored"
                    ? "No accounts monitored yet. Turn on monitoring (or unlock a contact) on an account to track it weekly."
                    : "No accounts yet. Paste a company URL to research one."}
              </div>
            ) : (
              filteredRows.map((r) => (
                <AccountRow
                  key={r.domain}
                  data={r}
                  onOpenPeople={setPeopleDrawer}
                  onOpen={setAccountDrawer}
                />
              ))
            )}
          </div>
        )}
      </div>

      <SuggestedAccounts
        activeAccountCount={rows.length}
        collapseThreshold={5}
      />
      </>
      )}

      <AccountPeopleDrawer
        open={!!peopleDrawer}
        domain={peopleDrawer?.domain ?? null}
        name={peopleDrawer?.name ?? null}
        onClose={() => setPeopleDrawer(null)}
      />

      <AccountDrawer
        data={accountDrawer}
        onClose={() => setAccountDrawer(null)}
      />
    </PageShell>
  );
}

