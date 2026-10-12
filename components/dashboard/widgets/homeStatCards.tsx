"use client";

/**
 * Home stats — one shared data bundle (useStatBundle) feeding the
 * fixed KPI row on the home screen (configurability scrapped
 * 2026-07-19).
 *
 * Every number here is derived from data Vera already holds — no card
 * may invent precision. When a card's inputs aren't configured (deal
 * economics) or collected yet, the home renders an honest set-up state.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrg } from "@/components/dashboard/OrgContext";
import {
  useAccountScores,
  useDealBaseline,
  useLeads,
  useSignals,
  useSoloLimits,
  useWatchlist,
} from "@/lib/dashboard/queries";
import type { DealBaseline } from "@/lib/dashboard/queries";
import type { Lead } from "@/lib/dashboard/types";
import { useGroups, smartMatchRefs } from "@/lib/dashboard/groups";
import { estimateAccountPotential } from "@/lib/dashboard/accountRevenuePotential";
import { deriveCveSummary } from "@/lib/dashboard/cyberIntent";
import { classifyType } from "@/lib/dashboard/signalCategories";
import { buyingTriggerSetFor } from "@/lib/dashboard/buyingTriggers";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { SELF_HOSTED } from "@/lib/selfHosted";

const DAY = 86_400_000;

const GROWTH_SIGNALS = new Set([
  "recently_funded",
  "recent_acquisition",
  "expansion",
  "new_partnership",
  "product_launch",
  "security_team_expansion",
  "hiring_sales_bd",
  "new_leadership",
  "security_leadership_hire",
]);

// ---------------------------------------------------------------------------
// Per-account rollups: one companies query for everything the cards need.
// ---------------------------------------------------------------------------

interface AccountRollup {
  id: string;
  domain: string;
  name: string | null;
  industry: string | null;
  size_band: string | null;
  profile_score: number | null;
  key_contacts: unknown[] | null;
  threat_alerts: unknown;
  credential_exposure: {
    employees?: number;
    recent_90d?: number;
  } | null;
  revenue_printed: string | null;
}

function useAccountRollups(domains: string[]) {
  return useQuery({
    queryKey: ["home_stat_rollups", [...domains].sort()],
    enabled: domains.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await createSupabaseBrowserClient()
        .from("companies")
        .select(
          "id, domain, name, industry, size_band, profile_score, key_contacts, threat_alerts, credential_exposure, revenue_printed:apollo_data->>organization_revenue_printed",
        )
        .in("domain", domains);
      if (error) throw error;
      const byDomain = new Map<string, AccountRollup>();
      const domainById = new Map<string, string>();
      for (const c of (data ?? []) as unknown as AccountRollup[]) {
        if (!c.domain) continue;
        const dom = c.domain.toLowerCase();
        byDomain.set(dom, c);
        domainById.set(c.id, dom);
      }
      return { byDomain, domainById };
    },
  });
}

/** "$1.1B" / "€30M" / "500M" → magnitude in units. Null when unparseable. */
function parsePrintedRevenue(v: string | null): number | null {
  if (!v) return null;
  const m = String(v).replace(/,/g, "").match(/([\d.]+)\s*([BMK]?)/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const mult =
    m[2]?.toUpperCase() === "B"
      ? 1_000_000_000
      : m[2]?.toUpperCase() === "M"
        ? 1_000_000
        : m[2]?.toUpperCase() === "K"
          ? 1_000
          : 1;
  return n * mult;
}

// ---------------------------------------------------------------------------
// The bundle
// ---------------------------------------------------------------------------

export interface StatBundle {
  baseline: DealBaseline | undefined;
  watchedCount: number;
  signalsWeek: number;
  signalsWeekDelta: number | null;
  buyingTriggersWeek: number;
  hotAccounts: number;
  hotLeads: Lead[];
  warmLeads: number;
  newInRole30: number;
  securityHires30: number;
  postingPeople7: number;
  multiSignalAccounts30: number;
  breachAdjacent30: number;
  credTotal: number;
  credRecent90: number;
  credAccounts: number;
  cveAccounts: number;
  cveCritical: number;
  contactCoverage: { covered: number; total: number } | null;
  avgProfileScore: number | null;
  profileAbove70: number;
  pipeline: { total: number; accounts: number } | null;
  hotPipeline: number | null;
  pipelineAdded30: number | null;
  topOpportunity: { name: string; estimate: number } | null;
  topGroup: { name: string; total: number } | null;
  revenueWatched: number | null;
  allowance: {
    accountsUsed: number;
    accountsLimit: number;
    unlocksUsed: number;
    unlocksLimit: number;
  } | null;
}

export function useStatBundle(): StatBundle {
  const { signalPriorities, features } = useOrg();
  const { data: signals } = useSignals();
  const { data: watchlist } = useWatchlist();
  const { data: leads } = useLeads();
  const { data: baseline } = useDealBaseline();
  const { data: scores7 } = useAccountScores({ sinceDays: 7 });
  const { data: scores30 } = useAccountScores({ sinceDays: 30 });
  const { data: groups } = useGroups();
  const { data: limits } = useSoloLimits(!SELF_HOSTED && !!features.solo_plan);

  const watchedDomains = useMemo(
    () =>
      [...new Set(
        (watchlist ?? [])
          .map((w) => (w.company_domain ?? "").toLowerCase())
          .filter(Boolean),
      )],
    [watchlist],
  );
  const { data: rollups } = useAccountRollups(watchedDomains);
  const triggerSet = useMemo(
    () => buyingTriggerSetFor(signalPriorities),
    [signalPriorities],
  );

  return useMemo<StatBundle>(() => {
    const now = Date.now();
    const week = now - 7 * DAY;
    const prevWeek = now - 14 * DAY;
    const month = now - 30 * DAY;

    const leadDomain = new Map<string, string>();
    for (const l of leads ?? []) {
      const dom = (
        (l as { company_domain?: string | null }).company_domain ?? ""
      ).toLowerCase();
      if (dom) leadDomain.set(l.id, dom);
    }
    const resolveDomain = (s: {
      company_id?: string | null;
      lead_id?: string | null;
      signal_data?: Record<string, unknown> | null;
    }): string => {
      const sd = s.signal_data ?? {};
      const fromData = String(
        (sd as Record<string, unknown>).company_domain ??
          (sd as Record<string, unknown>).domain ??
          "",
      ).toLowerCase();
      if (fromData) return fromData;
      if (s.company_id) return rollups?.domainById.get(s.company_id) ?? "";
      if (s.lead_id) return leadDomain.get(s.lead_id) ?? "";
      return "";
    };

    let signalsWeek = 0;
    let signalsPrevWeek = 0;
    let buyingTriggersWeek = 0;
    let newInRole30 = 0;
    let securityHires30 = 0;
    const postingPeople = new Set<string>();
    const perDomain = new Map<
      string,
      { c30: number; growth30: number; families: Set<string> }
    >();
    const breachDomains = new Set<string>();

    for (const s of signals ?? []) {
      if (!s.detected_at) continue;
      const t = new Date(s.detected_at).getTime();
      const type = s.signal_type ?? "";
      const dom = resolveDomain(s);
      const watched = dom && watchedDomains.includes(dom);

      if (t >= week) {
        signalsWeek += 1;
        if (triggerSet.has(type)) buyingTriggersWeek += 1;
        if (type === "person_posted_relevant_topic" || type === "person_engaged_with_topic") {
          const person = String(
            ((s.signal_data ?? {}) as Record<string, unknown>).person_name ?? "",
          ).trim();
          if (person) postingPeople.add(person.toLowerCase());
        }
      } else if (t >= prevWeek) {
        signalsPrevWeek += 1;
      }

      if (t >= month) {
        if (type === "person_new_in_role") newInRole30 += 1;
        if (type === "security_leadership_hire" || type === "security_team_expansion")
          securityHires30 += 1;
        if (watched) {
          const entry =
            perDomain.get(dom) ?? { c30: 0, growth30: 0, families: new Set<string>() };
          entry.c30 += 1;
          if (GROWTH_SIGNALS.has(type)) entry.growth30 += 1;
          entry.families.add(classifyType(type));
          perDomain.set(dom, entry);
          if (classifyType(type) === "breach") breachDomains.add(dom);
        }
      }
    }

    const signalsWeekDelta =
      signalsPrevWeek > 0
        ? Math.round(((signalsWeek - signalsPrevWeek) / signalsPrevWeek) * 100)
        : null;

    let hotAccounts = 0;
    for (const dom of watchedDomains) {
      if ((scores7?.get(dom)?.signalCount ?? 0) > 0) hotAccounts += 1;
    }

    const hotLeads = (leads ?? []).filter(
      (l) => l.lead_rating === "hot" && !l.outreach_at,
    );
    const warmLeads = (leads ?? []).filter(
      (l) => l.lead_rating === "warm" && !l.outreach_at,
    ).length;

    // Risk + quality rollups
    let credTotal = 0;
    let credRecent90 = 0;
    let credAccounts = 0;
    let cveAccounts = 0;
    let cveCritical = 0;
    let covered = 0;
    let profileSum = 0;
    let profileCount = 0;
    let profileAbove70 = 0;
    let revenueSum = 0;
    let revenueSeen = false;
    for (const dom of watchedDomains) {
      const r = rollups?.byDomain.get(dom);
      if (!r) continue;
      const ce = r.credential_exposure;
      if (ce && (ce.employees ?? 0) > 0) {
        credAccounts += 1;
        credTotal += ce.employees ?? 0;
        credRecent90 += ce.recent_90d ?? 0;
      }
      const cve = deriveCveSummary(r.threat_alerts);
      if (cve.total > 0) cveAccounts += 1;
      cveCritical += cve.critical + cve.kev;
      if (Array.isArray(r.key_contacts) && r.key_contacts.length > 0) covered += 1;
      if (typeof r.profile_score === "number") {
        profileSum += r.profile_score;
        profileCount += 1;
        if (r.profile_score >= 70) profileAbove70 += 1;
      }
      const rev = parsePrintedRevenue(r.revenue_printed);
      if (rev !== null) {
        revenueSum += rev;
        revenueSeen = true;
      }
    }

    // Money
    const potentials = new Map<string, number>();
    if (baseline?.averageDealSize) {
      for (const dom of watchedDomains) {
        const r = rollups?.byDomain.get(dom);
        const counts = perDomain.get(dom);
        const est = estimateAccountPotential({
          baseline: baseline.averageDealSize,
          currency: baseline.currency,
          highValueSegments: baseline.highValueSegments,
          lowValueSegments: baseline.lowValueSegments,
          enterpriseThresholdEmployees: baseline.enterpriseThresholdEmployees,
          minDeal: baseline.minDeal,
          maxDeal: baseline.maxDeal,
          sizeBand: r?.size_band ?? null,
          industry: r?.industry ?? null,
          signalCount: counts?.c30 ?? 0,
          growthSignalCount: counts?.growth30 ?? 0,
          cyberFindingCount: 0,
        });
        if (est && est.estimate > 0) potentials.set(dom, est.estimate);
      }
    }
    const hasMoney = !!baseline?.averageDealSize;
    let pipelineTotal = 0;
    let hotPipeline = 0;
    let topOpportunity: { name: string; estimate: number } | null = null;
    for (const [dom, est] of potentials) {
      pipelineTotal += est;
      const active = (scores7?.get(dom)?.signalCount ?? 0) > 0;
      if (active) hotPipeline += est;
      if (active && (!topOpportunity || est > topOpportunity.estimate)) {
        topOpportunity = {
          name: rollups?.byDomain.get(dom)?.name ?? dom,
          estimate: est,
        };
      }
    }
    let pipelineAdded30 = 0;
    for (const w of watchlist ?? []) {
      const dom = (w.company_domain ?? "").toLowerCase();
      const created = (w as { created_at?: string | null }).created_at;
      if (dom && created && new Date(created).getTime() >= month) {
        pipelineAdded30 += potentials.get(dom) ?? 0;
      }
    }

    let topGroup: { name: string; total: number } | null = null;
    if (hasMoney && groups) {
      const facts = new Map(
        [...(rollups?.byDomain ?? new Map<string, AccountRollup>())].map(
          ([dom, r]) => [
            dom,
            {
              industry: r.industry,
              hq_country: null,
              hq_city: null,
              size_band: r.size_band,
            },
          ],
        ),
      );
      for (const g of groups) {
        if (g.entity_type !== "account" || g.mode !== "smart") continue;
        const members = smartMatchRefs(g, {
          watchlist: watchlist ?? [],
          accountScores: scores30,
          companyFacts: facts,
        });
        const total = members.reduce((sum, dom) => sum + (potentials.get(dom) ?? 0), 0);
        if (total > 0 && (!topGroup || total > topGroup.total)) {
          topGroup = { name: g.name, total };
        }
      }
    }

    return {
      baseline,
      watchedCount: watchedDomains.length,
      signalsWeek,
      signalsWeekDelta,
      buyingTriggersWeek,
      hotAccounts,
      hotLeads,
      warmLeads,
      newInRole30,
      securityHires30,
      postingPeople7: postingPeople.size,
      multiSignalAccounts30: [...perDomain.values()].filter(
        (e) => e.families.size >= 2,
      ).length,
      breachAdjacent30: breachDomains.size,
      credTotal,
      credRecent90,
      credAccounts,
      cveAccounts,
      cveCritical,
      contactCoverage:
        watchedDomains.length > 0
          ? { covered, total: watchedDomains.length }
          : null,
      avgProfileScore:
        profileCount > 0 ? Math.round(profileSum / profileCount) : null,
      profileAbove70,
      pipeline: hasMoney
        ? { total: pipelineTotal, accounts: potentials.size }
        : null,
      hotPipeline: hasMoney ? hotPipeline : null,
      pipelineAdded30: hasMoney ? pipelineAdded30 : null,
      topOpportunity,
      topGroup,
      revenueWatched: revenueSeen ? revenueSum : null,
      allowance: limits && !SELF_HOSTED
        ? {
            accountsUsed: limits.usage.accounts,
            accountsLimit: limits.limits.accounts,
            unlocksUsed: limits.usage.unlocks_this_month,
            unlocksLimit: limits.limits.unlocks_per_month,
          }
        : null,
    };
  }, [
    signals,
    watchlist,
    leads,
    baseline,
    scores7,
    scores30,
    groups,
    limits,
    rollups,
    watchedDomains,
    triggerSet,
  ]);
}

