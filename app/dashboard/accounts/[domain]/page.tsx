"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Trash2,
  X,
  ExternalLink,
  ShieldCheck,
  Globe2,
  Loader2,
  Lock,
  Mail,
  Phone,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { useOrg } from "@/components/dashboard/OrgContext";
import {
  Card,
  EmptyState,
  PageShell,
  Pill,
  RelativeTime,
  SectionHeader,
  Shimmer,
} from "@/components/dashboard/primitives";
import { SlideToConfirm } from "@/components/ui/SlideToConfirm";
import { FindConnectedPeopleButton } from "@/components/dashboard/widgets/FindConnectedPeopleButton";
import { RefreshAccountButton } from "@/components/dashboard/widgets/RefreshAccountButton";
import { SendToButton } from "@/components/dashboard/widgets/SendToButton";
import { PersonIntelControl } from "@/components/dashboard/widgets/PersonIntelControl";
import {
  AccountTabPanel,
  AccountTabsBar,
  type AccountTab,
} from "@/components/dashboard/widgets/AccountTabs";
import { SignalsTimeline } from "@/components/dashboard/widgets/SignalsTimeline";
import { ProfileScoreCard } from "@/components/dashboard/widgets/ProfileScoreCard";
import {
  estimateAccountPotential,
  formatPotential,
} from "@/lib/dashboard/accountRevenuePotential";
import {
  BUYING_ROLE_LABELS,
  compareByBuyingRole,
  deriveBuyingRole,
  type BuyingRole,
} from "@/lib/dashboard/cyberIntent";
import {
  applyDedupAndAnnotate,
  applyEntityGroups,
  buildTechContextLookup,
  filterByQualityScore,
  type AnnotatedSignal,
} from "@/lib/dashboard/aiQualityPass";
import {
  computeScorecard,
  detectFrameworks,
  deriveRegulatedExposure,
  deriveSecurityProofGaps,
  deriveSensitiveData,
  extractSignalSourceLabel,
  extractSignalUrl,
  filterTenureClaimSignals,
  synthesiseWhyMatters,
  techTier,
  TECH_TIER_DESCRIPTIONS,
  TECH_TIER_LABELS,
  type AccountScorecard,
  type DetectedFramework,
  type RegulatedExposure,
  type ScoreBand,
  type SecurityProofGap,
  type TechTier,
  type WhyThisMattersSummary,
} from "@/lib/dashboard/cyberPressure";
import { humanizeLabel, proxiedAvatar, scrubBackendNames, signalTypeLabel } from "@/lib/dashboard/labels";
import { formatSizeBand } from "@/lib/dashboard/sizeBand";
import { buyingTriggerSetFor, dropHiddenSignals, hiddenSignalTypes } from "@/lib/dashboard/buyingTriggers";
import { isStaleByHeadline } from "@/lib/dashboard/signalFreshness";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAccountPersonIntel, useAccountPotential, useDealBaseline, useRemoveAccount, useAccountLeads, useSecurityJobs, useTargetTitles, useUnlockContact } from "@/lib/dashboard/queries";
import { useDismissedContacts, useDismissContact } from "@/lib/dashboard/relevanceFeedback";
import { pickSecurityContact } from "@/lib/dashboard/securityContact";
import { revenueDisplay } from "@/lib/dashboard/revenue";
import { logoUrl } from "@/lib/logoUrl";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CompanyRow {
  id: string;
  domain: string;
  name: string | null;
  industry: string | null;
  hq_country: string | null;
  hq_city: string | null;
  size_band: string | null;
  founded_year: number | null;
  linkedin_url: string | null;
  description: string | null;
  technologies: TechEntry[] | null;
  last_enriched_at: string | null;
  apollo_data: ApolloOrgData | null;
  deep_research_data: DeepResearchData | null;
  threat_alerts: ThreatAlertRow[] | null;
  ai_quality_pass: AiQualityPass | null;
  /** Haiku-generated "why this account matters" paragraph + metadata.
   *  Written by app/services/why_this_matters.py in the engine and
   *  refreshed during Phase E of the monitor pass. */
  why_this_matters: {
    paragraph: string;
    generated_at: string;
    model: string;
    facts_hash: string;
    trigger: string;
    signal_count_at_generation?: number;
  } | null;
  /** Cyber lens v1 — security team headcount (Apollo title search,
   *  search-only / reveal-free). Written by security_team_profiler.py
   *  in Phase F of the monitor pass. */
  security_team_profile: {
    counts_by_bucket: Record<string, number>;
    total: number;
    top_titles: string[];
    expected_band: [number, number];
    score: number;
    gap_buckets: string[];
    is_regulated_industry: boolean;
    refreshed_at: string;
  } | null;
  /** Cyber lens v1 — evidence-driven Profile score across the four
   *  axes + composite + peer band. Written by account_profile_scorer.py
   *  in Phase G of the monitor pass. */
  profile_score: ProfileScoreRow | null;
}

export interface ProfileScoreRow {
  risk: number;
  posture: number;
  maturity: number;
  commercial: number;
  composite: number;
  peer_band: {
    percentile: number;
    cohort_size: number;
    cohort_label: string;
  };
  axis_breakdown: Record<
    "risk" | "posture" | "maturity" | "commercial",
    { label: string; points: number; detail: string }[]
  >;
  delta_30d: {
    risk: number;
    posture: number;
    maturity: number;
    commercial: number;
    composite: number;
  };
  size_band: string;
  computed_at: string;
}

// Output of the AI quality pass (engine: app/services/ai_quality_pass.py).
// Runs Claude Haiku 4.5 on every enrichment to clean + contextualise the
// deterministic signal output. Strictly never invents facts — see the
// engine module.
export interface AiQualityPass {
  dedup_groups: {
    primary_signal_id: string;
    folded_signal_ids: string[];
    label: string;
  }[];
  entity_groups: {
    canonical_name: string;
    merged_names: string[];
  }[];
  quality_scores: Record<string, { score: number; note?: string }>;
  // Notes keyed by either signal_id (for inferred signals) OR tech name
  // (for stack entries). One hedged sentence each — pharma context,
  // size-of-company context, etc. Never absolute claims.
  market_context_notes: Record<string, string>;
  model: string | null;
}

interface TechEntry {
  name: string;
  category?: string;
  source?: string;
  detection_methods?: string[];
  behind_firewall?: boolean;
}

interface ApolloOrgData {
  organization_revenue_printed?: string | null;
  annual_revenue_printed?: string | null;
  publicly_traded_symbol?: string | null;
  publicly_traded_exchange?: string | null;
  founded_year?: number | null;
  estimated_num_employees?: number | null;
  owned_by_organization?: { name?: string; website_url?: string } | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  website_url?: string | null;
  linkedin_url?: string | null;
}

interface DeepResearchData {
  business_intel?: {
    competitors?: string[] | string;
    founded_year?: number | string;
    headquarters?: string;
    key_customers?: string[] | string;
    recent_awards?: string[] | string;
    estimated_revenue?: string;
    estimated_employees?: string;
  } | null;
  compliance?: {
    iso_27001?: boolean | string;
    soc_2?: boolean | string;
    pci_dss?: boolean | string;
    cyber_essentials?: boolean | string;
    cyber_essentials_plus?: boolean | string;
    crest?: boolean | string;
    check?: boolean | string;
    other_certifications?: string[] | string | null;
  } | null;
  growth_signals?: {
    product_launches?: string[] | string;
    office_expansions?: string[] | string;
    recent_partnerships?: string[] | string;
    upcoming_events?: string[] | string;
    clinical_stage_programs?: string[] | string;
  } | null;
  security_posture?: {
    has_bug_bounty?: boolean | string;
    has_trust_centre?: boolean | string;
    has_security_page?: boolean | string;
    has_privacy_policy?: boolean | string;
    has_responsible_disclosure?: boolean | string;
    privacy_policy_url?: string | null;
  } | null;
  compliance_gaps_for_mdr?: {
    risks?: string[] | string;
    assessment?: string;
    mdr_relevance?: string;
  } | null;
}

interface ThreatAlertRow {
  title?: string;
  url?: string;
  source?: string;
  urgency?: string;
  severity?: string;
  ai_summary?: string;
}

interface SignalRow {
  id: string;
  lead_id: string;
  signal_type: string;
  signal_source: string;
  signal_strength: number | null;
  signal_data: Record<string, unknown>;
  detected_at: string;
  // Classification axes (Phase 1 cyber-pressure model, 2026-05-28).
  // Columns default to safe values in DB so older rows are still valid.
  signal_subject_type: SignalSubjectType;
  inference_level: SignalInferenceLevel;
  source_quality: SignalSourceQuality;
  // Cyber lens axis (2026-06-09) — null on legacy rows + unmapped types.
  axis: SignalAxis | null;
  last_checked: string | null;
  snippet: string | null;
}

export type SignalAxis = "risk" | "posture" | "maturity" | "commercial";

export type SignalSubjectType =
  | "account"
  | "person"
  | "job"
  | "website"
  | "tech"
  | "news";

export type SignalInferenceLevel =
  | "observed"
  | "derived"
  | "inferred"
  | "speculative";

export type SignalSourceQuality =
  | "first_party"
  | "third_party"
  | "inferred_from_multiple_sources"
  | "weak_unverified";

interface AlertRow {
  id: string;
  alert_type: string | null;
  alert_title: string | null;
  alert_summary: string | null;
  urgency: string | null;
  status: string | null;
  detected_at: string | null;
}

interface PersonRow {
  apollo_id: string | null;
  first_name: string;
  last_name: string;             // empty when locked; populated when unlocked
  last_name_obfuscated: string;  // e.g. "Sp***e" — what Apollo shows for free
  title: string;
  seniority: string;
  linkedin_url: string;
  city: string;
  country: string;
  headline: string;
  has_email: boolean;            // true if Apollo holds an email behind the unlock
  has_phone: boolean;
  email: string | null;          // populated only when unlocked
  phone_numbers: unknown[] | null;
  unlocked: boolean;
  photo_url?: string | null;     // Apollo headshot when available (else initials)
}

// ---------------------------------------------------------------------------
// Data hooks — direct Supabase, no claraApi
// ---------------------------------------------------------------------------

function useAccountRecord(domain: string) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["account_record", orgId, domain],
    enabled: !!orgId && !!domain,
    queryFn: async () => {
      const sb = createSupabaseBrowserClient();

      // 1. Company row (global, by domain) — incl. apollo + deep research + threats + AI pass
      const { data: companies, error: cErr } = await sb
        .from("companies")
        .select(
          "id, domain, name, industry, hq_country, hq_city, size_band, founded_year, linkedin_url, description, technologies, last_enriched_at, apollo_data, deep_research_data, threat_alerts, ai_quality_pass, why_this_matters, security_team_profile, profile_score",
        )
        .ilike("domain", domain)
        .limit(1);
      if (cErr) throw cErr;
      const company = (companies?.[0] ?? null) as CompanyRow | null;

      // 2. Signals — union via lead_id (person-scoped) OR company_id
      //    (account-scoped, no person required — accounts-first paradigm).
      //    apollo_id is pulled so we can match Apollo people-search results
      //    back to lead rows and surface person-level signals on the account page.
      let signals: SignalRow[] = [];
      const { data: leadRows } = await sb
        .from("leads")
        .select("id, apollo_id")
        .eq("org_id", orgId)
        .ilike("company_domain", domain);
      const leads = (leadRows ?? []) as { id: string; apollo_id: string | null }[];
      const leadIds = leads.map((l) => l.id);
      const apolloToLead: Record<string, string> = {};
      for (const l of leads) {
        if (l.apollo_id) apolloToLead[l.apollo_id] = l.id;
      }
      const companyIdForDom = company?.id;
      const orClauses: string[] = [];
      if (leadIds.length > 0) orClauses.push(`lead_id.in.(${leadIds.join(",")})`);
      if (companyIdForDom) orClauses.push(`company_id.eq.${companyIdForDom}`);
      if (orClauses.length > 0) {
        const { data: sigs } = await sb
          .from("signals")
          .select(
            "id, lead_id, company_id, signal_type, signal_source, signal_strength, signal_data, detected_at, signal_subject_type, inference_level, source_quality, axis, last_checked, snippet",
          )
          .or(orClauses.join(","))
          .order("detected_at", { ascending: false })
          .limit(200);
        // Defensive: drop any tenure-claim signal that lacks dated
        // evidence (tenure-claim bug class, 2026-05-28). Engine fix
        // prevents new bad rows; this stops stale rows from rendering.
        signals = filterTenureClaimSignals(
          (sigs ?? []) as SignalRow[],
        );
      }

      // 3. Watchlist alerts — scoped to this org's watchlist row(s) at this domain
      let alerts: AlertRow[] = [];
      const { data: wl } = await sb
        .from("watchlist")
        .select("id")
        .eq("org_id", orgId)
        .ilike("company_domain", domain);
      const watchIds = (wl ?? []).map((w) => w.id);
      if (watchIds.length > 0) {
        const { data: al } = await sb
          .from("watchlist_alerts")
          .select(
            "id, alert_type, alert_title, alert_summary, urgency, status, detected_at",
          )
          .in("watchlist_id", watchIds)
          .order("detected_at", { ascending: false })
          .limit(50);
        alerts = (al ?? []) as AlertRow[];
      }

      return { company, signals, alerts, apolloToLead };
    },
    staleTime: 60_000,
  });
}

function usePeopleAtAccount(domain: string, titles: string[]) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["apollo_people", orgId, domain, [...titles].sort().join("|")],
    enabled: !!orgId && !!domain,
    queryFn: async () => {
      const sb = createSupabaseBrowserClient();
      const body: Record<string, unknown> = { org_id: orgId, domain };
      if (titles.length > 0) body.titles = titles;
      const { data, error } = await sb.functions.invoke<{
        people: PersonRow[];
        total: number;
      }>("apollo-people", { body });
      if (error) throw error;
      return data ?? { people: [], total: 0 };
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// (topTechs helper removed 2026-05-28 — superseded by TechStackByCategory's
// own tier-aware sort + the AI quality pass's entity_groups collapse.)

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

// Remove an account (e.g. an accidental research). Soft-delete: it disappears
// from the dashboard and monitoring stops, but the research allowance isn't
// refunded. Slide-to-confirm — it's destructive.
function RemoveAccountControl({ domain }: { domain: string }) {
  const router = useRouter();
  const del = useRemoveAccount();
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <div className="ml-auto flex items-center gap-2">
        <SlideToConfirm
          text="Slide to remove"
          successText="Removing…"
          width={200}
          height={30}
          onConfirm={async () => {
            await del.mutateAsync(domain);
            router.push("/dashboard/accounts");
          }}
        />
        <button
          type="button"
          onClick={() => setConfirming(false)}
          aria-label="Cancel"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-subtle text-text-muted transition-colors hover:bg-bg-elevated"
        >
          <X size={13} strokeWidth={1.7} />
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      title="Remove this account from your dashboard."
      className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border-subtle px-2.5 py-1 text-[12px] text-text-muted transition-colors hover:border-red-400/40 hover:text-red-400"
    >
      <Trash2 size={12} strokeWidth={1.7} />
      Remove account
    </button>
  );
}

export default function AccountPage() {
  const { features } = useOrg();
  if (!features.accounts_dashboard) notFound();

  const params = useParams<{ domain: string }>();
  const domain = decodeURIComponent(params?.domain ?? "").toLowerCase();

  const { data, isLoading, error } = useAccountRecord(domain);

  return (
    <PageShell>
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/dashboard/accounts"
          className="inline-flex items-center gap-1.5 text-[13px] text-text-muted hover:text-text-primary"
        >
          <ArrowLeft size={14} aria-hidden />
          Accounts
        </Link>
        <span className="text-text-muted">/</span>
        <span className="text-[13px] text-text-secondary">{domain}</span>
        <RemoveAccountControl domain={domain} />
      </div>

      {isLoading && (
        <div className="flex flex-col gap-5">
          <Shimmer className="h-40 w-full rounded-2xl" />
          <Shimmer className="h-32 w-full rounded-2xl" />
          <Shimmer className="h-64 w-full rounded-2xl" />
        </div>
      )}

      {error && (
        <Card className="p-8">
          <EmptyState
            icon={<ShieldAlert size={18} />}
            title="Couldn’t load this account"
            body={error instanceof Error ? error.message : "Try refreshing."}
          />
        </Card>
      )}

      {!isLoading && !error && data && (
        <AccountBody
          domain={domain}
          company={data.company}
          signals={data.signals}
          alerts={data.alerts}
          apolloToLead={data.apolloToLead}
        />
      )}
    </PageShell>
  );
}

function AccountBody({
  domain,
  company,
  signals,
  alerts,
  apolloToLead,
}: {
  domain: string;
  company: CompanyRow | null;
  signals: SignalRow[];
  alerts: AlertRow[];
  apolloToLead: Record<string, string>;
}) {
  const { features } = useOrg();

  if (!company) {
    return (
      <Card className="p-8">
        <EmptyState
          icon={<Sparkles size={18} />}
          title="No intelligence yet"
          body={`${domain} will populate once enrichment runs.`}
        />
      </Card>
    );
  }

  if (features.accounts_dashboard_tabs) {
    return (
      <TabbedAccount
        domain={domain}
        company={company}
        signals={signals}
        alerts={alerts}
        apolloToLead={apolloToLead}
      />
    );
  }

  // Existing scrolling layout (Vera org keeps this for A/B comparison).
  return (
    <div className="flex flex-col gap-5">
      <HeroHeader domain={domain} company={company} signals={signals} />

      <WhyVeraSurfacedThis signals={signals} alerts={alerts} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ThreatSurfaceCard threats={company.threat_alerts ?? []} />
        <CompliancePostureCard
          compliance={company.deep_research_data?.compliance ?? null}
          posture={company.deep_research_data?.security_posture ?? null}
          gaps={company.deep_research_data?.compliance_gaps_for_mdr ?? null}
        />
      </div>

      <TechStackByCategory technologies={company.technologies ?? []} />

      <GrowthSignalsCard
        growth={company.deep_research_data?.growth_signals ?? null}
      />

      <JobsHiringCard companyId={company.id} />

      <PeopleSection domain={domain} companyName={company.name ?? domain} />

      <ActivityTimeline signals={signals} alerts={alerts} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabbed account page — cyber-intelligence layout.
//
// Four tabs, each answering one rep question:
//   1. Overview       → "Is this a fit?"
//   2. Cyber profile  → "Why should I care?"
//   3. Signals        → "What changed?"
//   4. People         → "Who do I contact?"
//
// Outreach tab removed 2026-05-28 — Vera is an intelligence platform,
// not an outreach platform. Hard boundary: no AI-generated openers,
// CTAs, or messaging anywhere in the product.
// ---------------------------------------------------------------------------

const ACCOUNT_TAB_IDS = [
  "overview",
  "pressure",
  "signals",
  "people",
] as const;
type AccountTabId = (typeof ACCOUNT_TAB_IDS)[number];

function TabbedAccount({
  domain,
  company,
  signals,
  alerts,
  apolloToLead,
}: {
  domain: string;
  company: CompanyRow;
  signals: SignalRow[];
  alerts: AlertRow[];
  apolloToLead: Record<string, string>;
}) {
  const [active, setActive] = useState<AccountTabId>("overview");
  const { signalPriorities } = useOrg();

  const cveCount = Array.isArray(company.threat_alerts)
    ? company.threat_alerts.length
    : 0;

  // ----- AI quality pass application (Phase 2 cleanup) -----
  // Run once at the tab parent so every panel sees consistent annotations.
  // Falls back to raw deterministic output when ai_quality_pass is absent.
  // Weight-0 signal types drop first — never shown to this org, any tab.
  const aiPass = company.ai_quality_pass;
  const cleanedSignals: AnnotatedSignal<SignalRow>[] = useMemo(() => {
    const visible = dropHiddenSignals(signals, hiddenSignalTypes(signalPriorities));
    const qualityFiltered = filterByQualityScore(visible, aiPass);
    return applyDedupAndAnnotate(qualityFiltered, aiPass);
  }, [signals, aiPass, signalPriorities]);
  const collapsedTechs = useMemo(
    () => applyEntityGroups(company.technologies ?? [], aiPass),
    [company.technologies, aiPass],
  );
  const techContext = useMemo(() => buildTechContextLookup(aiPass), [aiPass]);

  const tabs: AccountTab[] = [
    { id: "overview", label: "Overview" },
    {
      id: "pressure",
      // Renamed from "Cyber pressure" 2026-05-28 — "pressure" reads
      // as fear-selling. "Profile" describes what's on the public surface
      // without implying the prospect has a problem.
      label: "Cyber profile",
      count: cveCount > 0 ? cveCount : null,
    },
    {
      id: "signals",
      label: "Signals",
      count: cleanedSignals.length + alerts.length,
    },
    // Social signals moved off the account page 2026-05-31 — they're now
    // on the main accounts table as a per-row count badge with a
    // hover popover. See SocialSignalsCell in AccountRow.
    { id: "people", label: "People" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Hero stays above tabs — it's the identity of the account, not a section */}
      <RichHeroHeader
        domain={domain}
        company={company}
        signals={signals}
        alerts={alerts}
      />

      <AccountTabsBar
        tabs={tabs}
        active={active}
        onChange={(id) => setActive(id as AccountTabId)}
      />

      <AccountTabPanel id="overview" active={active === "overview"}>
        <OverviewTab
          company={company}
          signals={cleanedSignals}
          alerts={alerts}
          collapsedTechs={collapsedTechs}
          techContext={techContext}
        />
      </AccountTabPanel>

      <AccountTabPanel id="pressure" active={active === "pressure"}>
        <CyberPressureTab company={company} />
      </AccountTabPanel>

      <AccountTabPanel id="signals" active={active === "signals"}>
        <SignalsTab company={company} signals={cleanedSignals} alerts={alerts} />
      </AccountTabPanel>

      <AccountTabPanel id="people" active={active === "people"}>
        {/* Who they're trying to hire sits above who they already have —
            an open req is the gap, the team is the current state. */}
        <div className="mb-5">
          <JobsHiringCard companyId={company.id} />
        </div>
        <PeopleSection
          domain={domain}
          companyName={company.name ?? domain}
          companyId={company.id}
          signals={cleanedSignals}
          apolloToLead={apolloToLead}
        />
      </AccountTabPanel>

      {/* Outreach tab removed 2026-05-28 — see ACCOUNT_TAB_IDS comment */}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero header — logo, name, ticker, location, revenue, parent, description
// ---------------------------------------------------------------------------

function HeroHeader({
  domain,
  company,
  signals: _signals,
}: {
  domain: string;
  company: CompanyRow;
  signals: SignalRow[];
}) {
  const apollo = company.apollo_data ?? {};
  const dr = company.deep_research_data ?? {};
  const revenue =
    apollo.organization_revenue_printed ??
    apollo.annual_revenue_printed ??
    dr.business_intel?.estimated_revenue ??
    null;
  const cleanedRevenue =
    revenue && revenue !== "Not found"
      ? /^[£$€]/.test(revenue)
        ? revenue
        : `$${revenue}`
      : null;
  const founded =
    company.founded_year ?? apollo.founded_year ?? dr.business_intel?.founded_year ?? null;
  const ticker = apollo.publicly_traded_symbol
    ? `${apollo.publicly_traded_exchange ?? "Listed"}: ${apollo.publicly_traded_symbol}`
    : null;
  const parent = apollo.owned_by_organization?.name ?? null;
  // hq_country sometimes holds the full address; prefer Apollo city/state when present.
  const hqLine = formatHq(company, apollo);
  const description =
    company.description ?? dr.business_intel?.headquarters ?? null;

  return (
    <Card className="p-7 md:p-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:gap-7">
        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl(domain, 128)}
          alt=""
          width={56}
          height={56}
          className="h-14 w-14 shrink-0 rounded-xl border border-border-default bg-white object-contain p-2"
        />

        {/* Identity block */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-display text-[1.65rem] font-medium tracking-tight text-text-primary md:text-[1.9rem]">
              {company.name ?? domain}
            </h1>
            <div className="ml-auto flex items-center gap-2 self-center">
              <SendToButton id={domain} entity="company" variant="row" />
              <RefreshAccountButton domain={domain} />
            </div>
            {ticker && (
              <span className="text-[11px] text-text-muted">
                {ticker}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-text-secondary">
            <a
              href={`https://${company.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-text-primary"
            >
              <Globe2 size={11} aria-hidden />
              {company.domain}
            </a>
            {company.linkedin_url && (
              <>
                <span className="text-text-muted/60">·</span>
                <a
                  href={company.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-text-primary"
                >
                  <ExternalLink size={10} aria-hidden />
                  LinkedIn
                </a>
              </>
            )}
            {parent && (
              <>
                <span className="text-text-muted/60">·</span>
                <span className="text-text-muted">
                  Owned by <span className="text-text-secondary">{parent}</span>
                </span>
              </>
            )}
          </div>

          {description && (
            <p className="mt-3 max-w-3xl text-[13.5px] leading-relaxed text-text-secondary">
              {description}
            </p>
          )}

          <PotentialBlock domain={domain} />

          <SecurityContactBlock domain={domain} />

          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
            {company.industry && (
              <FactBlock label="Industry" value={company.industry} />
            )}
            {hqLine && <FactBlock label="HQ" value={hqLine} />}
            {company.size_band && (
              <FactBlock label="Headcount" value={company.size_band} />
            )}
            {cleanedRevenue && (
              <FactBlock label="Revenue" value={cleanedRevenue} />
            )}
            {founded && (
              <FactBlock label="Founded" value={String(founded)} />
            )}
          </dl>
        </div>
      </div>
    </Card>
  );
}

/** Deal-potential headline — the org's average deal size scaled by the
 * account's size, revenue, industry and live signals. Accent-styled and
 * prominent (the number that makes a rep lean in). Renders nothing when
 * the org hasn't set an average deal size. */
/** The named security decision-maker (CISO / Head of Security) for the
 * account — the real buyer for a cyber vendor. Derived from the org's leads;
 * renders nothing when none is identified yet. */
function SecurityContactBlock({ domain }: { domain: string }) {
  const { data: leads } = useAccountLeads(domain);
  const contact = pickSecurityContact(leads, domain);
  if (!contact) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border-default bg-bg-elevated px-4 py-3">
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
        <ShieldCheck size={12} className="text-accent" aria-hidden />
        Security contact
      </span>
      <span className="text-[14px] font-medium text-text-primary">{contact.name}</span>
      {contact.title && (
        <span className="text-[13px] text-text-secondary">{contact.title}</span>
      )}
      {contact.email && (
        <a href={`mailto:${contact.email}`} className="text-[13px] text-accent hover:underline">
          {contact.email}
        </a>
      )}
      {contact.linkedin_url && (
        <a
          href={contact.linkedin_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[13px] text-text-muted hover:text-[#0a66c2]"
        >
          <ExternalLink size={11} aria-hidden />
          LinkedIn
        </a>
      )}
    </div>
  );
}


function PotentialBlock({ domain }: { domain: string }) {
  const { data } = useAccountPotential(domain);
  const display = revenueDisplay(data);
  if (!display) return null;
  const why = (data?.why_this_value ?? []).join("\n");
  return (
    <div className="mt-4 inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-accent/30 bg-accent/[0.07] px-4 py-2.5">
      <span
        className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent"
        title={why || undefined}
      >
        Deal potential
      </span>
      <span className="text-[22px] font-semibold tracking-tight text-accent">
        {display.estimate}
      </span>
      {display.range && (
        <span className="text-[12px] text-text-muted">{display.range}</span>
      )}
      {display.confidence && (
        <span className="text-[11px] text-text-muted">
          · {display.confidence} confidence
        </span>
      )}
    </div>
  );
}

function formatHq(
  company: CompanyRow,
  apollo: ApolloOrgData,
): string | null {
  // Apollo usually has clean city/state/country fields.
  if (apollo.city && apollo.country) {
    return `${apollo.city}, ${apollo.country}`;
  }
  if (apollo.city && apollo.state) {
    return `${apollo.city}, ${apollo.state}`;
  }
  if (company.hq_city && company.hq_country) {
    return `${company.hq_city}, ${company.hq_country}`;
  }
  // Fallback: the engine sometimes pushes a full address into hq_country.
  return company.hq_country ?? apollo.country ?? null;
}

function FactBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[13.5px] text-text-primary">
        {value}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RichHeroHeader — Phase 1 (tabbed account page) hero with Vera-native pills
// ---------------------------------------------------------------------------

function RichHeroHeader({
  domain,
  company,
  signals,
  alerts,
}: {
  domain: string;
  company: CompanyRow;
  signals: SignalRow[];
  alerts: AlertRow[];
}) {
  const apollo = company.apollo_data ?? {};
  const dr = company.deep_research_data ?? {};
  const revenue =
    apollo.organization_revenue_printed ??
    apollo.annual_revenue_printed ??
    dr.business_intel?.estimated_revenue ??
    null;
  const cleanedRevenue =
    revenue && revenue !== "Not found"
      ? /^[£$€]/.test(revenue)
        ? revenue
        : `$${revenue}`
      : null;
  const founded =
    company.founded_year ?? apollo.founded_year ?? dr.business_intel?.founded_year ?? null;
  const ticker = apollo.publicly_traded_symbol
    ? `${apollo.publicly_traded_exchange ?? "Listed"}: ${apollo.publicly_traded_symbol}`
    : null;
  const parent = apollo.owned_by_organization?.name ?? null;
  const hqLine = formatHq(company, apollo);
  const description =
    company.description ?? dr.business_intel?.headquarters ?? null;

  // Deal-potential estimate for the hero (2026-05-28). Used to make the
  // commercial value of the account visible up front, alongside revenue
  // + headcount, rather than only on the accounts list. Same calc as
  // the list view so the numbers reconcile.
  const { data: baseline } = useDealBaseline();
  const growthSignalCount = signals.filter((s) =>
    [
      "recently_funded",
      "recent_acquisition",
      "product_launch",
      "new_partnership",
      "expansion",
      "hiring_sales_bd",
    ].includes(s.signal_type),
  ).length;
  const cyberSignalCount = signals.filter((s) =>
    [
      "cve_in_stack",
      "breach_proximity",
      "compliance_gap",
      "security_leadership_hire",
      "security_team_expansion",
    ].includes(s.signal_type),
  ).length;
  const potential = baseline?.averageDealSize
    ? estimateAccountPotential({
        baseline: baseline.averageDealSize,
        currency: baseline.currency,
        highValueSegments: baseline.highValueSegments,
        lowValueSegments: baseline.lowValueSegments,
        enterpriseThresholdEmployees: baseline.enterpriseThresholdEmployees,
        minDeal: baseline.minDeal,
        maxDeal: baseline.maxDeal,
        sizeBand: company.size_band,
        industry: company.industry,
        signalCount: signals.length,
        growthSignalCount,
        cyberFindingCount: cyberSignalCount,
      })
    : null;
  const potentialLabel = potential
    ? potential.rangeLow === potential.rangeHigh
      ? formatPotential(potential.estimate, potential.currency)
      : `${formatPotential(potential.rangeLow, potential.currency)} – ${formatPotential(potential.rangeHigh, potential.currency)}`
    : null;

  // Derive the pill row — Vera-native: cyber-buying-window facts, not 6sense's "6QA / Maintain Engagement" jargon.
  const freshSignal = signals[0];
  const freshAlert = alerts[0];
  const lastActivityAt = freshSignal?.detected_at ?? freshAlert?.detected_at ?? null;
  const tempPill = pillForActivity(lastActivityAt);
  const cveCount = Array.isArray(company.threat_alerts)
    ? company.threat_alerts.length
    : 0;
  const kevCount = Array.isArray(company.threat_alerts)
    ? company.threat_alerts.filter(
        (t) => (t?.source ?? "").toLowerCase() === "cisa_kev",
      ).length
    : 0;
  const signalCount = signals.length;

  // Restructured 2026-06-08 — the old single-column
  // layout left a huge dead block on the right side of wide screens
  // because the description sat under the identity block (max-w-3xl).
  // New layout splits hero into:
  //   Top row:    logo + name + ticker + status + links (full width)
  //   Bottom row: description on the left (2/3) + facts as a vertical
  //               list on the right (1/3). Facts collapse to a 2-col
  //               grid on mobile. Description has no max-w cap now —
  //               the grid takes care of width balance.
  const facts: Array<{ label: string; value: string }> = [];
  if (company.industry)
    facts.push({ label: "Industry", value: humanizeLabel(company.industry) });
  if (hqLine) facts.push({ label: "HQ", value: hqLine });
  if (company.size_band)
    facts.push({
      label: "Headcount",
      value: `${formatSizeBand(company.size_band)} employees`,
    });
  if (cleanedRevenue) facts.push({ label: "Revenue", value: cleanedRevenue });
  if (founded) facts.push({ label: "Founded", value: String(founded) });
  if (potentialLabel)
    facts.push({
      label: `Deal potential (${potential?.confidence ?? "estimate"})`,
      value: potentialLabel,
    });

  return (
    <Card className="p-7 md:p-8">
      {/* Top row — identity (logo + name + status + links) */}
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:gap-7">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl(domain, 128)}
          alt=""
          width={56}
          height={56}
          className="h-14 w-14 shrink-0 rounded-xl border border-border-default bg-white object-contain p-2"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-display text-[1.65rem] font-medium tracking-tight text-text-primary md:text-[1.9rem]">
              {company.name ?? domain}
            </h1>
            {ticker && (
              <span className="text-[11px] text-text-muted">{ticker}</span>
            )}
          </div>

          {(tempPill || signalCount > 0 || cveCount > 0) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-text-secondary">
              {tempPill && <span>{tempPill.label}</span>}
              {tempPill && signalCount > 0 && (
                <span className="text-text-muted/60">·</span>
              )}
              {signalCount > 0 && (
                <span>
                  {signalCount} signal{signalCount === 1 ? "" : "s"} in 90d
                </span>
              )}
              {(tempPill || signalCount > 0) && (kevCount > 0 || cveCount > 0) && (
                <span className="text-text-muted/60">·</span>
              )}
              {kevCount > 0 ? (
                <span>{kevCount} KEV{kevCount === 1 ? "" : "s"} in stack</span>
              ) : cveCount > 0 ? (
                <span>{cveCount} CVE{cveCount === 1 ? "" : "s"} in stack</span>
              ) : null}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-text-secondary">
            <a
              href={`https://${company.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-text-primary"
            >
              <Globe2 size={11} aria-hidden />
              {company.domain}
            </a>
            {company.linkedin_url && (
              <>
                <span className="text-text-muted/60">·</span>
                <a
                  href={company.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-text-primary"
                >
                  <ExternalLink size={10} aria-hidden />
                  LinkedIn
                </a>
              </>
            )}
            {parent && (
              <>
                <span className="text-text-muted/60">·</span>
                <span className="text-text-muted">
                  Owned by <span className="text-text-secondary">{parent}</span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Description below identity — full card width, no readability
          cap. Use the horizontal space, don't
          leave dead whitespace on wide screens. */}
      {description && (
        <p className="mt-6 text-[13.5px] leading-relaxed text-text-secondary">
          {description}
        </p>
      )}

      {/* Facts row at the bottom — horizontal blocks across the card,
          NOT a vertical right-rail. 6 cols on desktop, 3 on tablet,
          2 on mobile. */}
      {facts.length > 0 && (
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border-subtle pt-5 md:grid-cols-3 lg:grid-cols-6">
          {facts.map((f) => (
            <FactBlock key={f.label} label={f.label} value={f.value} />
          ))}
        </dl>
      )}
    </Card>
  );
}


function pillForActivity(latestAt: string | null) {
  if (!latestAt)
    return {
      label: "Quiet",
      cls: "border-border-default bg-bg-elevated text-text-muted",
      dot: "bg-text-muted/60",
    };
  const days = (Date.now() - new Date(latestAt).getTime()) / 86_400_000;
  if (days < 7)
    return {
      label: "Hot",
      cls: "border-orange-400/40 bg-orange-400/10 text-orange-200",
      dot: "bg-orange-400",
    };
  if (days < 30)
    return {
      label: "Warm",
      cls: "border-amber-400/40 bg-amber-400/10 text-amber-200",
      dot: "bg-amber-400",
    };
  return {
    label: "Cold",
    cls: "border-border-default bg-bg-elevated text-text-muted",
    dot: "bg-text-muted/60",
  };
}


// ---------------------------------------------------------------------------
// Why Vera surfaced this — top 2 freshest signals, prominent
// ---------------------------------------------------------------------------

function WhyVeraSurfacedThis({
  signals,
  alerts,
}: {
  signals: SignalRow[];
  alerts: AlertRow[];
}) {
  // Merge signals + alerts into a unified "moment" list, pick top 2 freshest.
  const moments: { headline: string; detail: string | null; at: string; tone: "hot" | "warm" }[] = [];
  for (const s of signals) {
    const d = s.signal_data ?? {};
    const headline =
      (typeof d.headline === "string" && d.headline) ||
      signalTypeLabel(s.signal_type);
    const detail =
      typeof d.detail === "string" && d.detail !== headline ? d.detail : null;
    moments.push({
      headline,
      detail,
      at: s.detected_at,
      tone: s.signal_type === "cve_in_stack" || s.signal_type === "breach_proximity" ? "warm" : "hot",
    });
  }
  for (const a of alerts) {
    if (!a.detected_at) continue;
    moments.push({
      headline: a.alert_title ?? a.alert_type ?? "Alert",
      detail: a.alert_summary ?? null,
      at: a.detected_at,
      tone: a.urgency === "high" ? "hot" : "warm",
    });
  }
  moments.sort((a, b) => b.at.localeCompare(a.at));
  const top = moments.slice(0, 2);

  if (top.length === 0) {
    return (
      <Card className="p-6">
        <SectionHeader title="Why now" subtitle="No recent signals" />
        <div className="mt-3 text-[13px] text-text-muted">
          Vera will surface what matters as soon as it enriches the account.
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-7 md:p-8">
      <SectionHeader
        title="Why now"
        subtitle="The freshest signals on this account"
      />
      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
        {top.map((m, i) => (
          <div
            key={i}
            className={cn(
              "rounded-xl border p-4",
              m.tone === "hot"
                ? "border-rose-400/30 bg-rose-400/5"
                : "border-amber-400/30 bg-amber-400/5",
            )}
          >
            <div className="text-[14px] font-medium leading-snug text-text-primary">
              {scrubBackendNames(m.headline)}
            </div>
            {m.detail && (
              <div className="mt-1.5 text-[12.5px] leading-relaxed text-text-secondary">
                {scrubBackendNames(m.detail)}
              </div>
            )}
            <div className="mt-2 text-[11px] text-text-muted">
              <RelativeTime value={m.at} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Threat surface — lists actual CVEs, not just a count
// ---------------------------------------------------------------------------

function ThreatSurfaceCard({ threats }: { threats: ThreatAlertRow[] }) {
  if (!threats || threats.length === 0) {
    return (
      <Card className="p-7 md:p-8">
        <SectionHeader title="Threat surface" subtitle="No CVEs matched" />
        <div className="mt-3 text-[13px] text-text-muted">
          Vera hasn&apos;t matched any active CVEs to this account&apos;s detected stack.
        </div>
      </Card>
    );
  }
  return (
    <Card className="p-7 md:p-8">
      <SectionHeader
        title="Threat surface"
        subtitle={`${threats.length} active CVE${threats.length === 1 ? "" : "s"} in stack`}
      />
      <ul className="mt-4 flex flex-col gap-2.5">
        {threats.slice(0, 5).map((t, i) => {
          const isKev = (t.source ?? "").toLowerCase() === "cisa_kev";
          return (
            <li
              key={i}
              className="rounded-xl border border-border-subtle bg-bg-elevated/40 p-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <a
                    href={t.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-[13px] font-medium text-text-primary hover:text-accent"
                  >
                    {t.title ?? "CVE"}
                  </a>
                  {t.ai_summary && (
                    <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-text-secondary">
                      {t.ai_summary}
                    </p>
                  )}
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-md border px-2 py-0.5 text-[11px]",
                    isKev
                      ? "border-rose-400/40 bg-rose-400/10 text-rose-200"
                      : "border-orange-400/40 bg-orange-400/10 text-orange-200",
                  )}
                >
                  {isKev ? "KEV" : t.severity ?? "high"}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {threats.length > 5 && (
        <div className="mt-2 text-[11px] text-text-muted">
          + {threats.length - 5} more
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Compliance & posture — from deep_research_data
// ---------------------------------------------------------------------------

const COMPLIANCE_LABELS: Record<string, string> = {
  iso_27001: "ISO 27001",
  soc_2: "SOC 2",
  pci_dss: "PCI-DSS",
  cyber_essentials: "Cyber Essentials",
  cyber_essentials_plus: "Cyber Essentials+",
  crest: "CREST",
  check: "CHECK",
};

const POSTURE_LABELS_PUBLIC: Record<string, string> = {
  has_bug_bounty: "Bug bounty",
  has_trust_centre: "Trust centre",
  has_security_page: "Security page",
  has_responsible_disclosure: "Disclosure program",
};

function CompliancePostureCard({
  compliance,
  posture,
  gaps,
}: {
  compliance: DeepResearchData["compliance"] | null;
  posture: DeepResearchData["security_posture"] | null;
  gaps: DeepResearchData["compliance_gaps_for_mdr"] | null;
}) {
  const certifications = Object.entries(COMPLIANCE_LABELS)
    .map(([k, label]) => ({
      key: k,
      label,
      value: compliance ? (compliance as Record<string, unknown>)[k] : undefined,
    }))
    .filter((c) => c.value === true);

  const publicSignals = Object.entries(POSTURE_LABELS_PUBLIC)
    .map(([k, label]) => ({
      key: k,
      label,
      value: posture ? (posture as Record<string, unknown>)[k] : undefined,
    }))
    .filter((c) => c.value === true);

  const risks = Array.isArray(gaps?.risks) ? gaps!.risks : [];

  return (
    <Card className="p-7 md:p-8">
      <SectionHeader
        title="Compliance & posture"
      />
      <div className="mt-4 space-y-4">
        <div>
          <div className="text-[11px] text-text-muted">
            Certifications confirmed
          </div>
          {certifications.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {certifications.map((c) => (
                <Pill key={c.key} variant="accent">
                  ✓ {c.label}
                </Pill>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-[12.5px] text-text-muted">
              None found in public sources.
            </div>
          )}
        </div>

        <div>
          <div className="text-[11px] text-text-muted">
            Public security signals
          </div>
          {publicSignals.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {publicSignals.map((s) => (
                <Pill key={s.key} variant="muted">
                  {s.label}
                </Pill>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-[12.5px] text-text-muted">
              No public security pages, trust centre, or disclosure program.
            </div>
          )}
        </div>

        {risks.length > 0 && (
          <div>
            <div className="text-[11px] text-text-muted">
              Vera&apos;s read
            </div>
            <ul className="mt-2 flex flex-col gap-1.5 text-[12.5px] leading-snug text-text-secondary">
              {risks.slice(0, 4).map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-text-muted/60" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tech stack — grouped by category, provenance-aware
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  email_security: "Email security",
  waf_cdn: "WAF / Edge",
  edr: "EDR",
  siem: "SIEM",
  iam: "Identity & access",
  cloud: "Cloud",
  other: "Other",
};

const TECH_TIER_TONE: Record<TechTier, string> = {
  confirmed: "border-emerald-400/30 bg-emerald-400/5 text-text-primary",
  mentioned: "border-sky-400/25 bg-sky-400/[0.04] text-text-primary",
  detected: "border-border-default bg-bg-elevated text-text-secondary",
  inferred: "border-border-subtle bg-bg-elevated/40 text-text-muted",
};

type TechEntryWithMerge = TechEntry & {
  merged_variant_count?: number;
  merged_variant_names?: string[];
};

function TechStackByCategory({
  technologies,
  techContext,
}: {
  technologies: TechEntry[];
  techContext?: Map<string, string>;
}) {
  if (!Array.isArray(technologies) || technologies.length === 0) {
    return null;
  }
  const list = technologies as TechEntryWithMerge[];
  // Group by category; "other" goes last.
  const groups: Record<string, TechEntryWithMerge[]> = {};
  for (const t of list) {
    const cat = t.category || "other";
    (groups[cat] = groups[cat] ?? []).push(t);
  }
  const orderedCats = [
    ...Object.keys(CATEGORY_LABELS).filter((c) => c !== "other"),
    "other",
  ].filter((c) => groups[c]?.length);

  // Tier counts for the subtitle
  const tierCounts: Record<TechTier, number> = {
    confirmed: 0,
    mentioned: 0,
    detected: 0,
    inferred: 0,
  };
  for (const t of list) tierCounts[techTier(t.detection_methods)] += 1;
  const subtitleParts: string[] = [];
  if (tierCounts.confirmed > 0) subtitleParts.push(`${tierCounts.confirmed} confirmed`);
  if (tierCounts.mentioned > 0) subtitleParts.push(`${tierCounts.mentioned} mentioned`);
  if (tierCounts.detected > 0) subtitleParts.push(`${tierCounts.detected} detected`);
  if (tierCounts.inferred > 0) subtitleParts.push(`${tierCounts.inferred} inferred`);

  return (
    <Card className="p-7 md:p-8">
      <SectionHeader
        title="Tech stack"
        subtitle={subtitleParts.join(" · ") || `${technologies.length} detected`}
      />
      <div className="mt-5 space-y-5">
        {orderedCats.map((cat) => (
          <div key={cat}>
            <div className="text-[11px] text-text-muted">
              {CATEGORY_LABELS[cat] ?? cat}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {groups[cat].slice(0, 24).map((t) => {
                const tier = techTier(t.detection_methods);
                const variants = t.merged_variant_count ?? 0;
                const variantHint =
                  variants > 0 && (t.merged_variant_names ?? []).length > 0
                    ? `\nMerged variants: ${(t.merged_variant_names ?? []).join(", ")}`
                    : "";
                const note = techContext?.get(t.name.toLowerCase());
                return (
                  <span
                    key={t.name}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px]",
                      TECH_TIER_TONE[tier],
                    )}
                    title={
                      `${TECH_TIER_LABELS[tier]} — ${TECH_TIER_DESCRIPTIONS[tier]}`
                      + ((t.detection_methods?.length ?? 0) > 0
                        ? ` · via ${t.detection_methods!.join(", ")}`
                        : "")
                      + variantHint
                      + (note ? `\n\nContext: ${note}` : "")
                    }
                  >
                    {t.name}
                    <span className="text-[11px] opacity-60">
                      {TECH_TIER_LABELS[tier].slice(0, 4)}
                    </span>
                    {variants > 0 && (
                      <span
                        className="text-[11px] text-text-muted/80"
                        aria-label={`Merged ${variants} variants`}
                      >
                        +{variants}
                      </span>
                    )}
                  </span>
                );
              })}
              {groups[cat].length > 24 && (
                <span className="text-[11px] text-text-muted">
                  + {groups[cat].length - 24}
                </span>
              )}
            </div>
          </div>
        ))}
        <div className="border-t border-border-subtle pt-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-text-muted">
            <TierLegendDot tier="confirmed" />
            <TierLegendDot tier="mentioned" />
            <TierLegendDot tier="detected" />
            <TierLegendDot tier="inferred" />
            {techContext && techContext.size > 0 && (
              <span className="text-text-muted/70">
                · Hover for pharma/sector context
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function TierLegendDot({ tier }: { tier: TechTier }) {
  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={TECH_TIER_DESCRIPTIONS[tier]}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full border",
          TECH_TIER_TONE[tier].split(" ")[0],
          TECH_TIER_TONE[tier].split(" ")[1],
        )}
      />
      {TECH_TIER_LABELS[tier]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Growth signals — product launches, partnerships, expansions
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Jobs hiring — every OPEN security/GRC vacancy read from the account's own
// job board. Volume is the point: an account with 20 open
// security roles is visibly building something, whether or not a rep cares
// about any single advert. Long-open roles sort last but carry their age,
// because "they've been trying to fill this since March" is the opener.
// ---------------------------------------------------------------------------

const ROLE_LABEL: Record<string, string> = {
  vuln_mgt: "Vulnerability management",
  appsec: "Application security",
  cloud_sec: "Cloud security",
  soc: "Security operations",
  ir_threat: "Incident response",
  iam: "Identity and access",
  grc: "Governance and risk",
  leadership: "Security leadership",
  devsecops: "DevSecOps",
};

function JobsHiringCard({ companyId }: { companyId?: string | null }) {
  const { data, isLoading } = useSecurityJobs([companyId]);
  if (!companyId) return null;
  const jobs = data?.get(companyId) ?? [];

  return (
    <Card className="p-6 md:p-7">
      <SectionHeader
        title="Jobs hiring"
        subtitle="Open security and governance roles on this company's own job board."
        right={
          jobs.length > 0 ? (
            <span className="text-[12.5px] text-text-muted">
              {jobs.length} open
            </span>
          ) : undefined
        }
      />
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Shimmer key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        // Deliberately hedged: we may simply not have read their board yet,
        // and "no security hiring" is a claim we shouldn't make loosely.
        <p className="text-[12.5px] text-text-muted">
          No open security roles found on this company&rsquo;s job board.
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {jobs.map((j) => {
            const posted = j.first_published ?? j.first_seen;
            return (
              <li key={j.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    {j.url ? (
                      <a
                        href={j.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-[13.5px] font-medium text-text-primary hover:text-accent"
                      >
                        {j.title}
                      </a>
                    ) : (
                      <span className="truncate text-[13.5px] font-medium text-text-primary">
                        {j.title}
                      </span>
                    )}
                    {j.role_category && ROLE_LABEL[j.role_category] && (
                      <Pill variant="outline">{ROLE_LABEL[j.role_category]}</Pill>
                    )}
                  </div>
                  {j.location && (
                    <div className="mt-0.5 truncate text-[11.5px] text-text-muted">
                      {j.location}
                    </div>
                  )}
                </div>
                <span className="shrink-0 text-[11.5px] text-text-muted">
                  <RelativeTime value={posted} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function GrowthSignalsCard({
  growth,
}: {
  growth: DeepResearchData["growth_signals"] | null;
}) {
  if (!growth) return null;
  const groups: { label: string; items: string[] }[] = [];
  for (const [key, label] of [
    ["product_launches", "Product launches"],
    ["clinical_stage_programs", "Clinical-stage programs"],
    ["recent_partnerships", "Recent partnerships"],
    ["office_expansions", "Office expansions"],
    ["upcoming_events", "Upcoming events"],
  ] as const) {
    const raw = (growth as Record<string, unknown>)[key];
    const items = normaliseList(raw);
    if (items.length > 0) groups.push({ label, items });
  }
  if (groups.length === 0) return null;

  return (
    <Card className="p-7 md:p-8">
      <SectionHeader
        title="Growth signals"
      />
      <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="text-[11px] text-text-muted">
              {g.label}
            </div>
            <ul className="mt-2 flex flex-col gap-1.5 text-[12.5px] leading-snug text-text-secondary">
              {g.items.slice(0, 4).map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-text-muted/60" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

function normaliseList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((x) => String(x))
      .filter((s) => s && s.toLowerCase() !== "not found");
  }
  if (typeof raw === "string") {
    if (!raw || raw.toLowerCase() === "not found") return [];
    return [raw];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Activity timeline — consolidates Signals + Watchlist alerts
// ---------------------------------------------------------------------------

function ActivityTimeline({
  signals,
  alerts,
}: {
  signals: SignalRow[];
  alerts: AlertRow[];
}) {
  if (signals.length === 0 && alerts.length === 0) return null;
  return (
    <Card className="p-7 md:p-8">
      <SectionHeader
        title="Activity"
        subtitle={`${signals.length + alerts.length} signals & alerts`}
      />
      {signals.length > 0 && (
        <>
          <div className="mt-4 text-[11px] text-text-muted">
            Signals
          </div>
          <ul className="mt-2 flex flex-col gap-2">
            {signals.slice(0, 8).map((s) => (
              <SignalRowView key={s.id} s={s} />
            ))}
          </ul>
        </>
      )}
      {alerts.length > 0 && (
        <>
          <div className="mt-5 text-[11px] text-text-muted">
            Watchlist alerts
          </div>
          <ul className="mt-2 flex flex-col gap-2">
            {alerts.slice(0, 5).map((a) => (
              <AlertRowView key={a.id} a={a} />
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function PeopleSection({
  domain,
  companyName,
  companyId,
  signals = [],
  apolloToLead = {},
}: {
  domain: string;
  companyName: string;
  /** companies.id — required for the per-account person-intel toggle.
   * Null when the company hasn't been enriched yet (rare, can happen
   * if the rep loaded the page before first enrichment completed). */
  companyId?: string | null;
  signals?: SignalRow[];
  apolloToLead?: Record<string, string>;
}) {
  const { features } = useOrg();
  const stripped = !!features.accounts_dashboard_tabs;
  const { data: targetTitles } = useTargetTitles();
  const titles = targetTitles ?? [];
  const { data, isLoading, isError, error } = usePeopleAtAccount(domain, titles);
  const people = data?.people ?? [];
  // When PersonIntelControl has surfaced contacts
  // via the broader-leadership fallback, suppress the "No ICP-matched
  // people" empty state below — the contacts in the card above ARE the
  // people for this account; rendering a second "no one found" message
  // beneath them would be a duplicate.
  const { data: personIntel } = useAccountPersonIntel(companyId);
  const hasKeyContacts = (personIntel?.key_contacts?.length ?? 0) > 0;
  // Contacts this org has marked "not relevant" — hidden from the list.
  const { data: dismissed } = useDismissedContacts();

  // Build a per-lead bucket of person-subject signals once — passed down so
  // PersonRowView doesn't filter the full list per render.
  const signalsByLead = useMemo(() => {
    const out: Record<string, SignalRow[]> = {};
    for (const s of signals) {
      if (!s.lead_id) continue;
      if (s.signal_subject_type !== "person") continue;
      (out[s.lead_id] = out[s.lead_id] ?? []).push(s);
    }
    return out;
  }, [signals]);

  // Two modes:
  //  - stripped: plain People list, no buying-committee tagging.
  //  - legacy (Vera dev/test): derive roles + sort + show role badges.
  const peopleWithRole = useMemo(() => {
    // Drop anyone the org marked "not relevant" (per-org feedback).
    const visible = people.filter(
      (p) => !(p.apollo_id && dismissed?.has(p.apollo_id)),
    );
    if (stripped) {
      return visible
        .slice(0, PEOPLE_TAB_MAX)
        .map((p) => ({ person: p, role: null as BuyingRole | null }));
    }
    // Sort by buying-committee relevance (decision-makers first), then cap —
    // Apollo can return 25+ ICP matches per account; the rep only needs the
    // most relevant handful, not the whole dump.
    return visible
      .map((p) => ({
        person: p,
        role: deriveBuyingRole({ title: p.title, seniority: p.seniority }) as BuyingRole | null,
      }))
      .sort((a, b) =>
        compareByBuyingRole(a.role as BuyingRole, b.role as BuyingRole),
      )
      .slice(0, PEOPLE_TAB_MAX);
  }, [people, stripped, dismissed]);

  // Role counts only when we actually tag roles (legacy mode).
  const subtitleParts: string[] = [];
  if (!stripped) {
    const roleCounts: Partial<Record<BuyingRole, number>> = {};
    for (const { role } of peopleWithRole) {
      if (role) roleCounts[role] = (roleCounts[role] ?? 0) + 1;
    }
    if (roleCounts["decision-maker"])
      subtitleParts.push(
        `${roleCounts["decision-maker"]} decision-maker${roleCounts["decision-maker"]! > 1 ? "s" : ""}`,
      );
    if (roleCounts["technical-evaluator"])
      subtitleParts.push(`${roleCounts["technical-evaluator"]} tech eval`);
    if (roleCounts.influencer)
      subtitleParts.push(
        `${roleCounts.influencer} influencer${roleCounts.influencer! > 1 ? "s" : ""}`,
      );
    if (roleCounts["end-user"])
      subtitleParts.push(
        `${roleCounts["end-user"]} end-user${roleCounts["end-user"]! > 1 ? "s" : ""}`,
      );
  }

  const sectionTitle = stripped
    ? "People at this account"
    : "Key contacts at this account";
  const sectionSubtitle = stripped
    ? titles.length > 0
      ? `Matched to your ICP · ${titles.length} target titles`
      : "All roles"
    : peopleWithRole.length > 0
      ? subtitleParts.join(" · ") || "Decision-maker shortlist"
      : titles.length > 0
        ? `Matched to your ICP · ${titles.length} target titles`
        : "All roles · ICP not configured";

  return (
    <Card className="p-7 md:p-8">
      <SectionHeader
        title={sectionTitle}
        subtitle={sectionSubtitle}
        right={data ? <Pill variant="muted">{data.total} surfaced</Pill> : undefined}
      />

      {/* Person-intel opt-in toggle sits at the top of the People tab.
          Renders nothing when companyId is unavailable. */}
      {companyId ? (
        <div className="mt-5">
          <PersonIntelControl
            companyId={companyId}
            companyName={companyName}
          />
        </div>
      ) : null}

      {isLoading && (
        <div className="mt-5 flex items-center gap-2 text-[13px] text-text-muted">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          Finding people at this account…
        </div>
      )}
      {isError && (
        <div className="mt-5 text-[13px] text-rose-300/80" role="alert">
          Couldn&apos;t load people.{" "}
          {error instanceof Error ? error.message : ""}
        </div>
      )}
      {!isLoading && !isError && peopleWithRole.length === 0 && !hasKeyContacts && (
        <div className="mt-5">
          <EmptyState
            icon={<Users size={18} />}
            title={
              titles.length > 0
                ? "No ICP-matched people at this account"
                : "No people surfaced"
            }
            body={
              titles.length > 0
                ? "Apollo found no one at this domain matching your target titles."
                : "Apollo couldn't find people at this domain."
            }
          />
        </div>
      )}
      {peopleWithRole.length > 0 && (
        <ul className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
          {peopleWithRole.map(({ person, role }, i) => {
            const leadId = person.apollo_id
              ? apolloToLead[person.apollo_id]
              : undefined;
            const personSignals = leadId ? signalsByLead[leadId] ?? [] : [];
            return (
              <PersonRowView
                key={person.apollo_id ?? `${person.first_name}-${i}`}
                p={person}
                role={role}
                domain={domain}
                companyId={companyId}
                companyName={companyName}
                personSignals={personSignals}
              />
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// Cap the People-tab list — Apollo can return 25+ ICP matches; reps only need
// the most-relevant handful (sorted by buying role above).
const PEOPLE_TAB_MAX = 10;

// Person avatar — proxied photo with an initials fallback (mirrors the lead
// drawer's avatar). Keeps the People tab from looking like a bare text list.
function PersonAvatar({ photo, name }: { photo: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  const src = proxiedAvatar(photo);
  if (!src || failed) {
    return (
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bg-elevated text-[12px] font-medium text-text-primary">
        {initial}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      width={36}
      height={36}
      onError={() => setFailed(true)}
      className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
    />
  );
}

const BUYING_ROLE_BADGE: Record<BuyingRole, string> = {
  "decision-maker": "border-rose-400/40 bg-rose-400/10 text-rose-200",
  "technical-evaluator": "border-sky-400/30 bg-sky-400/5 text-sky-200",
  influencer: "border-amber-400/30 bg-amber-400/5 text-amber-200",
  "end-user": "border-emerald-400/30 bg-emerald-400/5 text-emerald-200",
  other: "border-border-default bg-bg-elevated text-text-muted",
};

function PersonRowView({
  p,
  role,
  domain,
  companyId,
  companyName,
  personSignals = [],
}: {
  p: PersonRow;
  role: BuyingRole | null;
  domain: string;
  companyId?: string | null;
  companyName: string;
  personSignals?: SignalRow[];
}) {
  const { features } = useOrg();
  const isSolo = !!features.solo_plan; // caps-based: no credit copy
  const unlock = useUnlockContact();
  const dismiss = useDismissContact();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const displayLastName = p.unlocked
    ? p.last_name
    : p.last_name_obfuscated || "•••";
  const fullName =
    [p.first_name, displayLastName].filter(Boolean).join(" ") ||
    "(unknown name)";
  const location = [p.city, p.country].filter(Boolean).join(", ");

  const lockedIndicators: { icon: typeof Mail; label: string }[] = [];
  if (!p.unlocked && p.has_email) lockedIndicators.push({ icon: Mail, label: "email" });
  if (!p.unlocked && p.has_phone) lockedIndicators.push({ icon: Phone, label: "phone" });

  const hasSignals = personSignals.length > 0;

  return (
    <li
      className={cn(
        "rounded-xl border bg-bg-elevated/40 p-4 transition-colors",
        hasSignals
          ? "cursor-pointer border-border-subtle hover:border-accent/40 hover:bg-bg-elevated/60"
          : "border-border-subtle",
      )}
      onClick={(e) => {
        if (!hasSignals) return;
        // Don't toggle when clicking an interactive child (links, buttons, slide)
        const target = e.target as HTMLElement;
        if (target.closest("a, button, [role='slider'], [data-no-toggle]")) return;
        setExpanded((v) => !v);
      }}
      aria-expanded={hasSignals ? expanded : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <PersonAvatar photo={p.photo_url ?? null} name={fullName} />
          <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="truncate font-display text-[14px] font-medium text-text-primary">
              {fullName}
            </div>
            {!p.unlocked && (
              <Lock
                size={11}
                className="shrink-0 text-text-muted"
                aria-label="Last name obfuscated by Apollo"
              />
            )}
            {hasSignals && (
              <span
                className="ml-1 inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/[0.05] px-1.5 py-0.5 text-[11px] text-accent"
                title="Person-level signals on file — click to expand"
              >
                {personSignals.length} signal{personSignals.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {p.title && (
            <div className="mt-0.5 truncate text-[12.5px] text-text-secondary">
              {p.title}
            </div>
          )}
          {location && (
            <div className="mt-1 text-[11.5px] text-text-muted">{location}</div>
          )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {role && (
            <span
              className={cn(
                "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px]",
                BUYING_ROLE_BADGE[role],
              )}
              title={`Contact role: ${BUYING_ROLE_LABELS[role]}`}
            >
              {BUYING_ROLE_LABELS[role]}
            </span>
          )}
          {p.linkedin_url && (
            <a
              href={p.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-muted transition hover:text-text-primary"
              aria-label={`Open ${fullName}'s LinkedIn`}
            >
              <ExternalLink size={14} />
            </a>
          )}
          {p.apollo_id && (
            <button
              type="button"
              data-no-toggle
              onClick={(e) => {
                e.stopPropagation();
                dismiss.mutate({
                  apolloId: p.apollo_id!,
                  name: fullName,
                  title: p.title,
                  domain,
                  surface: "account_people",
                });
              }}
              className="text-[11px] text-text-muted transition-colors hover:text-red-400"
              title="Mark as not relevant. Vera learns from this and stops surfacing similar roles."
            >
              Not relevant
            </button>
          )}
        </div>
      </div>

      {/* Unlocked: show email + phone if present */}
      {p.unlocked && (p.email || (p.phone_numbers && p.phone_numbers.length > 0)) && (
        <div className="mt-2.5 flex flex-col gap-1 text-[12px] text-text-secondary">
          {p.email && (
            <div className="flex items-center gap-2">
              <Mail size={11} className="text-text-muted" aria-hidden />
              <span className="truncate">{p.email}</span>
            </div>
          )}
        </div>
      )}

      {/* Locked-info indicators (what would be unlocked) */}
      {!p.unlocked && lockedIndicators.length > 0 && (
        <div className="mt-2 flex items-center gap-3 text-[11px] text-text-muted">
          {lockedIndicators.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-1">
              <Icon size={10} aria-hidden />
              <span>{label} available</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <FindConnectedPeopleButton
          apolloId={p.apollo_id}
          domain={domain}
          companyName={companyName}
          contactName={
            [p.first_name, p.unlocked ? p.last_name : p.last_name_obfuscated]
              .filter(Boolean)
              .join(" ") || "this contact"
          }
        />
        {!p.unlocked && p.apollo_id && companyId && (
          <SlideToConfirm
            text={isSolo ? "Unlock contact" : "Unlock · 1 credit"}
            successText="Unlocked"
            width={200}
            height={36}
            disabled={unlock.isPending}
            onConfirm={async () => {
              setErrorMsg(null);
              try {
                // Pass person hints — this list comes from a live Apollo search,
                // so the apollo_id may not be in key_contacts yet; the engine
                // matches by name/linkedin/domain and appends it on success.
                await unlock.mutateAsync({
                  companyId,
                  apolloId: p.apollo_id!,
                  firstName: p.first_name,
                  lastName: p.last_name || undefined,
                  name: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.first_name,
                  title: p.title || undefined,
                  linkedinUrl: p.linkedin_url || undefined,
                });
              } catch (e) {
                setErrorMsg(e instanceof Error ? e.message : "Unlock failed");
                throw e;
              }
            }}
          />
        )}
      </div>
      {errorMsg && (
        <p className="mt-1.5 text-[11px] text-rose-300/80" role="alert">
          {errorMsg}
        </p>
      )}

      {/* Expanded panel — person-level signals on this lead */}
      {expanded && hasSignals && (
        <PersonSignalPanel signals={personSignals} />
      )}
    </li>
  );
}

function PersonSignalPanel({ signals }: { signals: SignalRow[] }) {
  // Group signals by sub-category for a clean readout:
  //  - "Function" (role label, e.g. person_security_leader)
  //  - "Tenure"   (new_in_role, promoted, changed_company)
  //  - "Activity" (active_linkedin, posted_relevant_topic)
  //  - "Other"
  const groups: Record<string, SignalRow[]> = {};
  for (const s of signals) {
    const cat = personSignalCategory(s.signal_type);
    (groups[cat] = groups[cat] ?? []).push(s);
  }
  const order = ["Function", "Tenure", "Activity", "Other"].filter(
    (k) => (groups[k] ?? []).length > 0,
  );

  return (
    <div
      data-no-toggle
      className="mt-3 border-t border-border-subtle pt-3"
    >
      {order.map((cat) => (
        <div key={cat} className="mb-3 last:mb-0">
          <div className="text-[11px] text-text-muted">
            {cat}
          </div>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {groups[cat].map((s) => (
              <PersonSignalLine key={s.id} s={s} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function personSignalCategory(signalType: string): string {
  if (
    signalType === "person_security_leader" ||
    signalType === "person_grc_leader" ||
    signalType === "person_technical_leader" ||
    signalType === "person_commercial_leader"
  ) {
    return "Function";
  }
  if (
    signalType === "person_new_in_role" ||
    signalType === "person_promoted" ||
    signalType === "person_changed_company"
  ) {
    return "Tenure";
  }
  if (
    signalType === "person_active_linkedin" ||
    signalType === "person_posted_relevant_topic"
  ) {
    return "Activity";
  }
  return "Other";
}

function PersonSignalLine({ s }: { s: SignalRow }) {
  const d = s.signal_data ?? {};
  const headline =
    (typeof d.headline === "string" && d.headline) ||
    signalTypeLabel(s.signal_type);
  const detail =
    typeof d.detail === "string" && d.detail !== headline ? d.detail : null;
  const url = extractSignalUrl(d);
  const monthsInRole =
    typeof d.months_in_role === "number" ? d.months_in_role : null;
  const startedRaw =
    typeof d.started_at_raw === "string" ? d.started_at_raw : null;

  return (
    <li className="flex items-start justify-between gap-2 rounded-md bg-bg-elevated/40 p-2">
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] leading-snug text-text-primary">
          {scrubBackendNames(headline)}
        </div>
        {detail && (
          <div className="mt-0.5 text-[11.5px] leading-snug text-text-secondary">
            {scrubBackendNames(detail)}
          </div>
        )}
        {s.snippet && (
          <blockquote className="mt-1 border-l border-border-default pl-2 text-[11px] italic leading-snug text-text-muted">
            &ldquo;{s.snippet}&rdquo;
          </blockquote>
        )}
        {(startedRaw || monthsInRole != null) && (
          <div className="mt-1 text-[11px] text-text-muted">
            {startedRaw && <>Started {startedRaw}</>}
            {monthsInRole != null && (
              <span className="ml-2">≈ {monthsInRole} months in role</span>
            )}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className="rounded-md border border-border-default bg-bg-elevated px-1.5 py-0.5 text-[11px] text-text-muted"
          title={s.inference_level}
        >
          {s.inference_level}
        </span>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-muted hover:text-text-primary"
            aria-label="Open source"
          >
            <ExternalLink size={11} />
          </a>
        )}
      </div>
    </li>
  );
}

const INFERENCE_TONE: Record<SignalInferenceLevel, string> = {
  observed: "border-emerald-400/30 bg-emerald-400/[0.04] text-emerald-200",
  derived: "border-sky-400/30 bg-sky-400/[0.04] text-sky-200",
  inferred: "border-amber-400/30 bg-amber-400/[0.04] text-amber-200",
  speculative: "border-border-default bg-bg-elevated text-text-muted",
};

const INFERENCE_DESCRIPTION: Record<SignalInferenceLevel, string> = {
  observed: "Directly seen in source — fact",
  derived: "Calculated from observed data",
  inferred: "Hypothesis from multiple weak signals",
  speculative: "Weak signal — do not use as a messaging claim",
};

const SOURCE_QUALITY_LABEL: Record<SignalSourceQuality, string> = {
  first_party: "First-party",
  third_party: "Third-party",
  inferred_from_multiple_sources: "Multi-source",
  weak_unverified: "Unverified",
};

function SignalRowView({ s }: { s: SignalRow | AnnotatedSignal<SignalRow> }) {
  const data = s.signal_data ?? {};
  // AI-pass annotations (folded duplicates, market-context hedge).
  // Cast once so we don't sprinkle 'as AnnotatedSignal' through the JSX.
  const ann = s as AnnotatedSignal<SignalRow>;
  const foldedCount = ann.folded_count ?? 0;
  const foldedLabel = ann.folded_label;
  const marketContextNote = ann.market_context_note;
  const headline =
    (typeof data.headline === "string" && data.headline) ||
    (typeof data.detail === "string" && data.detail) ||
    s.signal_type;
  const detail =
    typeof data.detail === "string" && data.detail !== headline
      ? data.detail
      : null;
  const url = extractSignalUrl(data);
  const sourceLabel = extractSignalSourceLabel(s.signal_source, data);
  // Confidence: signal_strength 0-1 → low/med/high band
  const strength = typeof s.signal_strength === "number" ? s.signal_strength : null;
  const confidenceBand: "high" | "medium" | "low" | null =
    strength == null ? null : strength >= 0.7 ? "high" : strength >= 0.4 ? "medium" : "low";

  // Phase-1 classification axes
  const infer = s.inference_level ?? "observed";
  const quality = s.source_quality ?? "third_party";

  return (
    <li
      className={cn(
        "rounded-xl border bg-bg-elevated/40 p-4",
        // Speculative signals get muted styling to discourage acting on them
        infer === "speculative"
          ? "border-border-subtle/60 opacity-75"
          : "border-border-subtle",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13.5px] text-text-primary">
            {scrubBackendNames(headline)}
          </div>
          {detail && (
            <div className="mt-1 text-[12.5px] text-text-secondary">
              {scrubBackendNames(detail)}
            </div>
          )}
          {s.snippet && (
            <blockquote className="mt-2 border-l-2 border-border-default pl-2.5 text-[12px] italic leading-snug text-text-muted">
              &ldquo;{s.snippet}&rdquo;
            </blockquote>
          )}
          {marketContextNote && (
            <div className="mt-2 rounded-md border border-sky-400/20 bg-sky-400/[0.03] px-2.5 py-1.5 text-[11.5px] leading-snug text-text-secondary">
              <span className="mr-1 text-[11px] text-sky-300/80">
                Context
              </span>
              {marketContextNote}
            </div>
          )}
          {(url || sourceLabel) && (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-text-muted">
              {sourceLabel && <span>Source: {sourceLabel}</span>}
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-text-primary"
                >
                  <ExternalLink size={10} />
                  View
                </a>
              )}
              <span className="text-text-muted/60">·</span>
              <span title={`Source quality: ${SOURCE_QUALITY_LABEL[quality]}`}>
                {SOURCE_QUALITY_LABEL[quality]}
              </span>
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Pill variant="muted">{signalTypeLabel(s.signal_type)}</Pill>
          <span className="text-[11px] text-text-muted">
            <RelativeTime value={s.detected_at} />
          </span>
          <span
            className={cn(
              "rounded-md border px-1.5 py-0.5 text-[11px]",
              INFERENCE_TONE[infer],
            )}
            title={INFERENCE_DESCRIPTION[infer]}
          >
            {infer}
          </span>
          {confidenceBand && (
            <span
              className={cn(
                "rounded-md border px-1.5 py-0.5 text-[11px]",
                confidenceBand === "high"
                  ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-200"
                  : confidenceBand === "medium"
                    ? "border-amber-400/30 bg-amber-400/5 text-amber-200"
                    : "border-border-default bg-bg-elevated text-text-muted",
              )}
              title={`Confidence ${confidenceBand} (strength ${strength?.toFixed(2)})`}
            >
              {confidenceBand}
            </span>
          )}
          {foldedCount > 0 && (
            <span
              className="rounded-md border border-text-muted/40 bg-bg-elevated px-1.5 py-0.5 text-[11px] text-text-muted"
              title={foldedLabel ?? `${foldedCount} overlapping signals folded into this one`}
            >
              +{foldedCount} folded
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function AlertRowView({ a }: { a: AlertRow }) {
  return (
    <li className="rounded-xl border border-border-subtle bg-bg-elevated/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {a.alert_title && (
            <div className="text-[13.5px] text-text-primary">{a.alert_title}</div>
          )}
          {a.alert_summary && (
            <div className="mt-1 text-[12.5px] text-text-secondary">
              {a.alert_summary}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {a.urgency && (
            <Pill
              variant={
                a.urgency === "high"
                  ? "danger"
                  : a.urgency === "medium"
                    ? "warning"
                    : "muted"
              }
            >
              {a.urgency}
            </Pill>
          )}
          {a.detected_at && (
            <span className="text-[11px] text-text-muted">
              <RelativeTime value={a.detected_at} />
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

// ===========================================================================
// CYBER-INTEL TAB CONTENT (account page — accounts_dashboard_tabs)
// ===========================================================================

/**
 * Shared intelligence derivation. Pure, runs on every render — fast enough
 * (small synchronous regex work). Keeps each tab's logic readable.
 */
function useAccountIntelligence(
  company: CompanyRow,
  signals: SignalRow[],
  highValueSegments: string[],
) {
  const { signalPriorities } = useOrg();
  const orgTriggerSet = useMemo(
    () => buyingTriggerSetFor(signalPriorities),
    [signalPriorities],
  );
  return useMemo(() => {
    const dr = company.deep_research_data ?? {};
    const businessIntel = dr.business_intel ?? {};
    const customerNames = normaliseList(businessIntel.key_customers);
    // Case-study industries aren't yet in this page's company shape; we leave
    // the array empty rather than fake it. The engine collects it — wire when
    // the column surfaces in the account page query.
    const caseStudyIndustries: string[] = [];

    const description = company.description ?? null;

    const frameworks = detectFrameworks({
      compliance: (dr.compliance ?? null) as Record<string, unknown> | null,
      otherCertifications: dr.compliance?.other_certifications,
      texts: [description, company.industry],
    });

    const regulatedExposure = deriveRegulatedExposure({
      industry: company.industry,
      description,
      customerNames,
      caseStudyIndustries,
    });

    const sensitiveData = deriveSensitiveData({
      description,
      industry: company.industry,
      services: [],
    });

    const proofGaps = deriveSecurityProofGaps({
      securityPosture: (dr.security_posture ?? null) as Record<string, unknown> | null,
      frameworks,
      regulatedExposure,
    });

    const latestSignalAt = signals[0]?.detected_at ?? null;
    const cyberSignalCount = signals.filter((s) =>
      [
        "cve_in_stack",
        "breach_proximity",
        "compliance_gap",
        "security_leadership_hire",
        "security_team_expansion",
      ].includes(s.signal_type),
    ).length;
    const growthSignalCount = signals.filter((s) =>
      [
        "recently_funded",
        "recent_acquisition",
        "product_launch",
        "new_partnership",
        "expansion",
        "hiring_sales_bd",
      ].includes(s.signal_type),
    ).length;

    const scorecard = computeScorecard({
      industry: company.industry,
      sizeBand: company.size_band,
      highValueSegments,
      latestSignalAt,
      signalCount: signals.length,
      growthSignalCount,
      cyberFindingCount: cyberSignalCount,
      frameworks,
      regulatedExposure,
      sensitiveData,
      proofGaps,
      enrichedAt: company.last_enriched_at,
    });

    // Strict whitelist + freshness + SERP-cruft filter (2026-06-08).
    // "Why this account matters" was leaking false
    // positives: GitHub repo titles containing the account name as
    // a substring ("Support for lemonade as API provider"), Reddit
    // SERP-attribution rows ("user on some subreddit"), and stale
    // 2023 events. We now ONLY surface signals from the canonical
    // buying-trigger whitelist (same set HomeV2 and AnalyticsV2
    // use) — broad social_company_mention etc. are excluded.
    const topSignalLabels = signals
      .filter((s) => orgTriggerSet.has(s.signal_type))
      .filter((s) => {
        const d = s.signal_data ?? {};
        const candidate = String(
          (typeof d.headline === "string" && d.headline) ||
            (typeof d.summary === "string" && d.summary) ||
            (typeof d.quoted_excerpt === "string" && d.quoted_excerpt) ||
            "",
        ).trim();
        // Drop stale (event year < current year — see signalFreshness.ts)
        if (isStaleByHeadline(candidate, s.signal_type)) return false;
        // Drop SERP-attribution noise: "<username> on <subreddit>" /
        // "username on PageName" — common when the engine's social
        // listener falls back to SERP titles instead of actual content.
        if (/^[A-Za-z0-9_\-]+\s+on\s+[A-Za-z0-9_]+$/.test(candidate)) return false;
        return true;
      })
      .slice(0, 3)
      .map((s) => {
        const d = s.signal_data ?? {};
        const rawLabel =
          (typeof d.headline === "string" && d.headline) ||
          (typeof d.summary === "string" && d.summary) ||
          signalTypeLabel(s.signal_type);
        const label = scrubBackendNames(rawLabel);
        const rawDetail =
          typeof d.detail === "string" && d.detail !== rawLabel ? d.detail : undefined;
        const detail = rawDetail ? scrubBackendNames(rawDetail) : undefined;
        return { label, detail };
      });

    const whyMatters = synthesiseWhyMatters({
      companyName: company.name ?? company.domain,
      scorecard,
      topSignalLabels,
      regulatedExposure,
      sensitiveData,
      frameworks,
      proofGaps,
    });

    return {
      frameworks,
      regulatedExposure,
      sensitiveData,
      proofGaps,
      scorecard,
      whyMatters,
      customerNames,
      cyberSignalCount,
      growthSignalCount,
    };
  }, [company, signals, highValueSegments]);
}

// ---------------------------------------------------------------------------
// OVERVIEW TAB — Is this a fit?
// ---------------------------------------------------------------------------

function OverviewTab({
  company,
  signals,
  alerts,
  collapsedTechs,
  techContext,
}: {
  company: CompanyRow;
  signals: SignalRow[];
  alerts: AlertRow[];
  collapsedTechs?: TechEntry[];
  techContext?: Map<string, string>;
}) {
  const { features } = useOrg();
  const { data: baseline } = useDealBaseline();
  const highValueSegments = baseline?.highValueSegments ?? [];
  const intel = useAccountIntelligence(company, signals, highValueSegments);

  return (
    <div className="flex flex-col gap-5">
      {/* Lead with the narrative, then the decision scorecard — fit, timing,
          cyber relevance, data confidence. For cyber-lens orgs the full
          profile score + radar moves to the Cyber profile tab; other orgs keep
          the scorecard below the signals timeline. */}
      <WhyThisAccountMatters
        summary={intel.whyMatters}
        signals={signals}
        alerts={alerts}
        aiParagraph={
          (company.why_this_matters as { paragraph?: string } | null)?.paragraph ?? null
        }
      />
      {features.cyber_lens_v1 && <AccountScorecardCard scorecard={intel.scorecard} />}
      <SignalsTimeline signals={signals} alerts={alerts} windowDays={180} />
      {!features.cyber_lens_v1 && <AccountScorecardCard scorecard={intel.scorecard} />}
      <TechStackByCategory
        technologies={collapsedTechs ?? company.technologies ?? []}
        techContext={techContext}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CYBER PRESSURE TAB — Why should I care?
// ---------------------------------------------------------------------------

function CyberPressureTab({ company }: { company: CompanyRow }) {
  const { features } = useOrg();
  const { data: baseline } = useDealBaseline();
  const highValueSegments = baseline?.highValueSegments ?? [];
  const intel = useAccountIntelligence(company, [], highValueSegments);

  return (
    <div className="flex flex-col gap-5">
      {features.cyber_lens_v1 && company.profile_score && (
        <ProfileScoreCard
          score={company.profile_score}
          teamProfile={company.security_team_profile}
          paragraph={
            (company.why_this_matters as { paragraph?: string } | null)?.paragraph ?? null
          }
        />
      )}
      <ComplianceFrameworksCard
        frameworks={intel.frameworks}
        posture={company.deep_research_data?.security_posture ?? null}
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ThreatSurfaceCard threats={company.threat_alerts ?? []} />
        <SecurityProofGapsCard gaps={intel.proofGaps} />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <RegulatedExposureCard exposure={intel.regulatedExposure} />
        <SensitiveDataCard data={intel.sensitiveData} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SIGNALS TAB — What changed?
// ---------------------------------------------------------------------------

function SignalsTab({
  company,
  signals,
  alerts,
}: {
  company: CompanyRow;
  signals: SignalRow[];
  alerts: AlertRow[];
}) {
  const { features } = useOrg();
  const cyberLens = !!features.cyber_lens_v1;

  return (
    <div className="flex flex-col gap-5">
      {/* Per-account signals layout. Two modes:
          A) cyber_lens_v1 (pilot 2026-06-09) — activity chart + four
             lens sections (Risk / Posture / Maturity / Commercial) + Other
             bucket for unmapped types. Universal cyber lens; no per-
             vendor tuning. JobPostingsCard removed under this mode
             (2026-06-10) — those signals already render under Maturity
             in the lens grouping; rendering them twice was the visible
             "duplicate signals" problem.
          B) Default — activity chart + buying-trigger whitelist + Other
             accordion (the 2026-06-08 layout). */}
      <AccountSignalActivity signals={signals} />
      {cyberLens ? (
        <AccountAxisGroups signals={signals} />
      ) : (
        <>
          <AccountBuyingTriggers signals={signals} alerts={alerts} />
          <AccountOtherActivity signals={signals} />
        </>
      )}
      {/* Growth + Customer signals as a 2-col tile row below the lens
          grid — same visual rhythm as the axis cards above. Each tile
          is compact rather than full-width to match the cleaner layout
          (2026-06-10). */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <GrowthSignalsCard
          growth={company.deep_research_data?.growth_signals ?? null}
        />
        <CustomerSignalsCard
          customers={normaliseList(
            company.deep_research_data?.business_intel?.key_customers,
          )}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OUTREACH TAB — What do I say?
// ---------------------------------------------------------------------------

// (Outreach tab deleted 2026-05-28 — see ACCOUNT_TAB_IDS comment)

// ===========================================================================
// OVERVIEW TAB — components
// ===========================================================================

function WhyThisAccountMatters({
  aiParagraph,
}: {
  // The old prop surface (summary, signals, alerts) is intentionally
  // unused now. One paragraph. No "Top public
  // signals" list, no "Operating context" block, no "Freshest signal"
  // line. Those structured sections were causing visible duplication
  // because they re-rendered the same signals already shown elsewhere
  // on the dossier. The paragraph IS the summary; the Signals tab IS
  // the structured evidence. One thing per surface.
  summary?: unknown;
  signals?: unknown;
  alerts?: unknown;
  aiParagraph?: string | null;
}) {
  if (!aiParagraph) return null;
  return (
    <Card className="p-7 md:p-8">
      <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted">
        Why this account matters
      </div>
      <p className="mt-3 text-[14px] leading-relaxed text-text-primary">
        {scrubBackendNames(aiParagraph)}
      </p>
    </Card>
  );
}

function AccountScorecardCard({ scorecard }: { scorecard: AccountScorecard }) {
  const items: { label: string; score: AccountScorecard[keyof AccountScorecard] }[] = [
    { label: "Fit", score: scorecard.fit },
    { label: "Timing", score: scorecard.timing },
    // "Cyber pressure" → "Cyber relevance" 2026-05-28: measures how much
    // cyber matters for this account's profile, not how much they're suffering.
    { label: "Cyber relevance", score: scorecard.cyberPressure },
    { label: "Data confidence", score: scorecard.dataConfidence },
  ];
  return (
    <Card className="p-7 md:p-8">
      <SectionHeader
        title="Account scorecard"
        subtitle="Four independent reads — not one vague summary score"
      />
      <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        {items.map((it) => (
          <ScoreCell key={it.label} label={it.label} score={it.score} />
        ))}
      </div>
    </Card>
  );
}

function ScoreCell({
  label,
  score,
}: {
  label: string;
  score: { value: number; band: ScoreBand; reasoning: string };
}) {
  const tone =
    score.band === "high"
      ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-200"
      : score.band === "medium"
        ? "border-amber-400/30 bg-amber-400/5 text-amber-200"
        : "border-border-default bg-bg-elevated text-text-muted";
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-xl border p-4",
        tone,
      )}
    >
      <div className="text-[11px] text-text-muted">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-[1.8rem] font-medium tracking-tight text-text-primary">
          {score.value}
        </span>
        <span className="text-[11px] text-text-muted">
          / 100
        </span>
      </div>
      <div className="text-[11.5px] leading-snug text-text-secondary">
        {score.reasoning}
      </div>
    </div>
  );
}

// ===========================================================================
// CYBER PRESSURE TAB — components
// ===========================================================================

function ComplianceFrameworksCard({
  frameworks,
  posture,
}: {
  frameworks: DetectedFramework[];
  posture: DeepResearchData["security_posture"] | null;
}) {
  const confirmed = frameworks.filter((f) => f.source === "confirmed");
  const mentioned = frameworks.filter((f) => f.source === "mentioned");
  const publicSignals = Object.entries(POSTURE_LABELS_PUBLIC)
    .map(([k, label]) => ({
      key: k,
      label,
      value: posture ? (posture as Record<string, unknown>)[k] : undefined,
    }))
    .filter((s) => s.value === true);

  return (
    <Card className="p-7 md:p-8">
      <SectionHeader
        title="Compliance frameworks"
        subtitle="Confirmed certifications, mentioned frameworks, public security signals"
      />
      <div className="mt-5 space-y-5">
        <div>
          <div className="text-[11px] text-text-muted">
            Confirmed certifications
          </div>
          {confirmed.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {confirmed.map((f) => (
                <Pill key={f.id} variant="accent">
                  ✓ {f.label}
                </Pill>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-[12.5px] text-text-muted">
              None confirmed in public sources.
            </div>
          )}
        </div>
        {mentioned.length > 0 && (
          <div>
            <div className="text-[11px] text-text-muted">
              Mentioned but not formally claimed
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {mentioned.map((f) => (
                <span
                  key={f.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border-default bg-bg-elevated px-2.5 py-0.5 text-[12px] text-text-secondary"
                  title="Found on public surface but not surfaced as a confirmed certification"
                >
                  {f.label}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] text-text-muted">
              Found in description or supporting text — not yet confirmed as an
              audited cert.
            </p>
          </div>
        )}
        <div>
          <div className="text-[11px] text-text-muted">
            Public security signals
          </div>
          {publicSignals.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {publicSignals.map((s) => (
                <Pill key={s.key} variant="muted">
                  {s.label}
                </Pill>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-[12.5px] text-text-muted">
              No public security pages, trust centre, or disclosure program.
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function SecurityProofGapsCard({ gaps }: { gaps: SecurityProofGap[] }) {
  // Card renamed semantically: this is about *public visibility* of proof,
  // not deficiency. A regulated company almost always has the standard
  // frameworks internally — what we observe is whether they surface them
  // publicly.
  if (gaps.length === 0) {
    return (
      <Card className="p-7 md:p-8">
        <SectionHeader
          title="Public proof visibility"
          subtitle="Security / compliance proof is visible on the public site"
        />
        <p className="mt-3 text-[12.5px] text-text-muted">
          The rep can reference public security documentation up front rather
          than chase it during discovery.
        </p>
      </Card>
    );
  }
  return (
    <Card className="p-7 md:p-8">
      <SectionHeader
        title="Public proof visibility"
        subtitle={`${gaps.length} item${gaps.length === 1 ? "" : "s"} not surfaced publicly — discovery question, not a posture claim`}
      />
      <ul className="mt-4 flex flex-col gap-3">
        {gaps.map((g) => (
          <li
            key={g.id}
            className="rounded-xl border border-border-default bg-bg-elevated/40 p-4"
          >
            <div className="text-[13px] font-medium text-text-primary">
              {g.label}
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-text-secondary">
              {g.why}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-text-muted">
        A company of this profile likely holds the frameworks internally — just not on the public surface
      </p>
    </Card>
  );
}

function RegulatedExposureCard({ exposure }: { exposure: RegulatedExposure }) {
  const hasAny =
    exposure.ownIndustry != null || exposure.customerSegments.length > 0;
  return (
    <Card className="p-7 md:p-8">
      <SectionHeader
        title="Regulated exposure"
        subtitle="What part of the regulated world this account sits inside"
      />
      {!hasAny ? (
        <p className="mt-4 text-[12.5px] text-text-muted">
          No regulated industries detected in their own positioning or named
          customer base.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {exposure.ownIndustry && (
            <div>
              <div className="text-[11px] text-text-muted">
                Own industry
              </div>
              <div className="mt-2">
                <Pill variant="warning">{exposure.ownIndustry.label}</Pill>
              </div>
              <p className="mt-2 text-[11.5px] text-text-muted">
                They sit under direct regulatory scrutiny in this segment.
              </p>
            </div>
          )}
          {exposure.customerSegments.length > 0 && (
            <div>
              <div className="text-[11px] text-text-muted">
                Sells into
              </div>
              <ul className="mt-2 flex flex-col gap-1.5 text-[12.5px] text-text-secondary">
                {exposure.customerSegments.map((s) => (
                  <li key={s.id} className="flex gap-2">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-400/70" />
                    <span>
                      <span className="text-text-primary">{s.label}</span>{" "}
                      <span className="text-text-muted">— evidence: {s.evidence}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function SensitiveDataCard({
  data,
}: {
  data: { id: string; label: string }[];
}) {
  return (
    <Card className="p-7 md:p-8">
      <SectionHeader
        title="Sensitive data handled"
        subtitle="Inferred from public positioning — not internal claims"
      />
      {data.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-text-muted">
          No sensitive-data indicators found in public description.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {data.map((d) => (
            <Pill key={d.id} variant="muted">
              {d.label}
            </Pill>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] text-text-muted">
        Inferred from public website + industry positioning. Not a claim of
        internal practice.
      </p>
    </Card>
  );
}

// ===========================================================================
// SIGNALS TAB — components
// ===========================================================================

function TriggerSignalsCard({
  signals,
  alerts,
}: {
  signals: SignalRow[];
  alerts: AlertRow[];
}) {
  if (signals.length === 0 && alerts.length === 0) {
    return (
      <Card className="p-7 md:p-8">
        <SectionHeader title="Public trigger signals" subtitle="No recent signals" />
        <p className="mt-3 text-[12.5px] text-text-muted">
          Vera will surface trigger signals as soon as enrichment runs.
        </p>
      </Card>
    );
  }
  return (
    <Card className="p-7 md:p-8">
      <SectionHeader
        title="Public trigger signals"
        subtitle={`${signals.length} signal${signals.length === 1 ? "" : "s"} · ${alerts.length} alert${alerts.length === 1 ? "" : "s"}`}
      />
      {signals.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {signals.slice(0, 12).map((s) => (
            <SignalRowView key={s.id} s={s} />
          ))}
        </ul>
      )}
      {alerts.length > 0 && (
        <>
          <div className="mt-5 text-[11px] text-text-muted">
            Watchlist alerts
          </div>
          <ul className="mt-2 flex flex-col gap-2">
            {alerts.slice(0, 5).map((a) => (
              <AlertRowView key={a.id} a={a} />
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function JobPostingsCard({ signals }: { signals: SignalRow[] }) {
  if (signals.length === 0) {
    return (
      <Card className="p-7 md:p-8">
        <SectionHeader
          title="Job posting signals"
          subtitle="No hiring signals on the public record"
        />
        <p className="mt-3 text-[12.5px] text-text-muted">
          When Vera detects security, GRC, or sales/BD roles, they appear here
          with an explanation of why they matter.
        </p>
      </Card>
    );
  }
  return (
    <Card className="p-7 md:p-8">
      <SectionHeader
        title="Job posting signals"
        subtitle={`${signals.length} hiring signal${signals.length === 1 ? "" : "s"}`}
      />
      <ul className="mt-4 flex flex-col gap-2.5">
        {signals.map((s) => {
          const d = s.signal_data ?? {};
          const headline =
            (typeof d.headline === "string" && d.headline) ||
            signalTypeLabel(s.signal_type);
          const detail = typeof d.detail === "string" ? d.detail : null;
          const url = extractSignalUrl(d);
          const why = jobSignalWhyMatters(s.signal_type);
          return (
            <li
              key={s.id}
              className="rounded-xl border border-border-subtle bg-bg-elevated/40 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium text-text-primary">
                    {scrubBackendNames(headline)}
                  </div>
                  {detail && (
                    <div className="mt-1 text-[12.5px] text-text-secondary">
                      {scrubBackendNames(detail)}
                    </div>
                  )}
                  {why && (
                    <p className="mt-2 text-[11.5px] leading-snug text-text-muted">
                      <span className="font-medium text-text-secondary">
                        Why it matters:
                      </span>{" "}
                      {why}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Pill variant="muted">{signalTypeLabel(s.signal_type)}</Pill>
                  <span className="text-[11px] text-text-muted">
                    <RelativeTime value={s.detected_at} />
                  </span>
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-muted transition hover:text-text-primary"
                      aria-label="Open source"
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function jobSignalWhyMatters(signalType: string): string | null {
  switch (signalType) {
    case "security_leadership_hire":
      return "New security leader = first 90 days vendor-review window. Strong commercial timing.";
    case "security_team_expansion":
      return "Team scaling = the gap they're filling tells you the workflow pain. Pitch into the gap.";
    case "hiring_security":
      return "Active security headcount = real budget. Role title narrows the angle.";
    case "hiring_grc":
      return "GRC hiring = compliance pressure is becoming a workflow blocker. Strong signal for audit-readiness or evidence-collection tools.";
    case "hiring_sales_bd":
      return "Scaling commercial team = moving upmarket = more security reviews from prospects. Indirect cyber-buying context.";
    case "new_leadership":
      return "Fresh leadership = re-evaluation of existing vendors is more likely in the first six months.";
    default:
      return null;
  }
}

function CustomerSignalsCard({ customers }: { customers: string[] }) {
  if (customers.length === 0) {
    return (
      <Card className="p-7 md:p-8">
        <SectionHeader
          title="Customer & market signals"
          subtitle="No named customers on public surfaces"
        />
        <p className="mt-3 text-[12.5px] text-text-muted">
          Named customers, case studies, and partner announcements will surface
          here once the engine picks them up.
        </p>
      </Card>
    );
  }
  return (
    <Card className="p-7 md:p-8">
      <SectionHeader
        title="Customer & market signals"
        subtitle={`${customers.length} customer${customers.length === 1 ? "" : "s"} on public record`}
      />
      <div className="mt-4 flex flex-wrap gap-1.5">
        {customers.slice(0, 16).map((c) => (
          <Pill key={c} variant="muted">
            {c}
          </Pill>
        ))}
        {customers.length > 16 && (
          <span className="text-[11px] text-text-muted">
            + {customers.length - 16}
          </span>
        )}
      </div>
      <p className="mt-3 text-[11px] text-text-muted">
        Who they sell to often shapes how much security proof they need on
        hand — regulated buyers tend to ask for more documentation.
      </p>
    </Card>
  );
}


// ===========================================================================
// SIGNALS TAB v2 — visualisation + categorised, scroll-free (2026-06-08)
// ===========================================================================

const SIGNALS_TAB_WINDOW_DAYS = 90;

const ST_TRIGGER_CATEGORY: Record<string, "breach" | "leadership" | "funding" | "hiring" | "person"> = {
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

const ST_CATEGORY_COLOR: Record<string, string> = {
  breach: "rgb(248 113 113)",
  leadership: "rgb(251 191 36)",
  funding: "rgb(56 189 248)",
  hiring: "rgb(167 139 250)",
  person: "rgb(52 211 153)",
};

const ST_CATEGORY_TONE: Record<string, string> = {
  breach: "border-red-400/40 bg-red-400/10 text-red-300",
  leadership: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  funding: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  hiring: "border-violet-400/40 bg-violet-400/10 text-violet-300",
  person: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
};

// ---------------------------------------------------------------------------
// 1. Mini activity chart — signals/week stacked by category
// ---------------------------------------------------------------------------
function AccountSignalActivity({ signals }: { signals: SignalRow[] }) {
  const data = useMemo(() => {
    const cutoff = Date.now() - SIGNALS_TAB_WINDOW_DAYS * 86_400_000;
    // Bucket by week — 13 weeks total. Sparser than per-day, more readable
    // at this card width.
    const buckets = new Map<
      string,
      { week: string; breach: number; leadership: number; funding: number; hiring: number; person: number }
    >();
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    for (let i = 12; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, {
        week: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        breach: 0,
        leadership: 0,
        funding: 0,
        hiring: 0,
        person: 0,
      });
    }

    for (const s of signals) {
      if (!s.detected_at) continue;
      const t = new Date(s.detected_at).getTime();
      if (t < cutoff) continue;
      const cat = ST_TRIGGER_CATEGORY[s.signal_type];
      if (!cat) continue;
      const d = (s.signal_data ?? {}) as Record<string, unknown>;
      const headline = String(
        d.headline || d.summary || d.quoted_excerpt || s.signal_type,
      );
      if (isStaleByHeadline(headline, s.signal_type)) continue;
      // Snap to the nearest bucket key (week start) before this signal
      const signalDate = new Date(t);
      signalDate.setHours(0, 0, 0, 0);
      let bucketKey: string | null = null;
      for (const key of Array.from(buckets.keys()).reverse()) {
        if (key <= signalDate.toISOString().slice(0, 10)) {
          bucketKey = key;
          break;
        }
      }
      if (bucketKey) {
        const bucket = buckets.get(bucketKey)!;
        (bucket as any)[cat] += 1;
      }
    }

    return Array.from(buckets.values());
  }, [signals]);

  const hasData = data.some(
    (d) => d.breach + d.leadership + d.funding + d.hiring + d.person > 0,
  );

  return (
    <Card className="p-7 md:p-8">
      <div className="flex items-start justify-between gap-3">
        <SectionHeader
          title="Signal activity"
          subtitle={`Last ${SIGNALS_TAB_WINDOW_DAYS} days, by week.`}
        />
        <div className="hidden flex-wrap gap-2 md:flex">
          {(["breach", "leadership", "funding", "hiring", "person"] as const).map((k) => (
            <span
              key={k}
              className="inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.1em] text-text-muted"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: ST_CATEGORY_COLOR[k] }} />
              {k}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-4 h-[160px] w-full">
        {!hasData ? (
          <div className="flex h-full items-center justify-center text-[12px] text-text-muted">
            No buying-trigger signals in the last 90 days.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(255 255 255 / 0.05)" />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 10, fill: "rgb(180 180 195)" }}
                axisLine={{ stroke: "rgb(255 255 255 / 0.08)" }}
                tickLine={false}
                minTickGap={20}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: "rgb(180 180 195)" }}
                axisLine={{ stroke: "rgb(255 255 255 / 0.08)" }}
                tickLine={false}
                width={24}
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
              {(["breach", "leadership", "funding", "hiring", "person"] as const).map((k) => (
                <Area
                  key={k}
                  type="monotone"
                  dataKey={k}
                  stackId="1"
                  stroke={ST_CATEGORY_COLOR[k]}
                  fill={ST_CATEGORY_COLOR[k]}
                  fillOpacity={0.45}
                  strokeWidth={1}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2. Buying triggers — strict whitelist, top 8 most relevant
// ---------------------------------------------------------------------------
const BUYING_TRIGGER_MAX = 8;

function AccountBuyingTriggers({
  signals,
  alerts,
}: {
  signals: SignalRow[];
  alerts: AlertRow[];
}) {
  const { signalPriorities } = useOrg();
  const orgTriggerSet = useMemo(
    () => buyingTriggerSetFor(signalPriorities),
    [signalPriorities],
  );
  const rows = useMemo(() => {
    return signals
      .filter((s) => orgTriggerSet.has(s.signal_type))
      .filter((s) => {
        const d = s.signal_data ?? {};
        const candidate = String(
          (typeof d.headline === "string" && d.headline) ||
            (typeof d.summary === "string" && d.summary) ||
            (typeof d.quoted_excerpt === "string" && d.quoted_excerpt) ||
            "",
        ).trim();
        if (isStaleByHeadline(candidate, s.signal_type)) return false;
        // Drop SERP-attribution noise patterns ("username on subreddit")
        if (/^[A-Za-z0-9_\-]+\s+on\s+[A-Za-z0-9_]+$/.test(candidate)) return false;
        return true;
      })
      .slice(0, BUYING_TRIGGER_MAX);
  }, [signals]);

  return (
    <Card className="p-7 md:p-8">
      <SectionHeader
        title="Buying triggers"
        subtitle={
          rows.length === 0
            ? "Nothing actionable in the last 90 days."
            : `${rows.length} signal${rows.length === 1 ? "" : "s"} worth a rep's attention.`
        }
      />
      {rows.length > 0 && (
        <ul className="mt-5 flex flex-col gap-3">
          {rows.map((s) => {
            const cat = ST_TRIGGER_CATEGORY[s.signal_type] ?? "leadership";
            const d = s.signal_data ?? {};
            const headline = scrubBackendNames(
              String(
                (typeof d.headline === "string" && d.headline) ||
                  (typeof d.summary === "string" && d.summary) ||
                  (typeof d.quoted_excerpt === "string" && d.quoted_excerpt) ||
                  signalTypeLabel(s.signal_type),
              ),
            );
            const url = typeof d.url === "string" ? d.url : null;
            return (
              <li
                key={s.id}
                className="flex items-start gap-3 rounded-lg border border-border-subtle bg-bg-card/40 p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em]",
                        ST_CATEGORY_TONE[cat],
                      )}
                    >
                      {signalTypeLabel(s.signal_type)}
                    </span>
                    {s.detected_at && (
                      <span className="font-mono text-[10.5px] text-text-muted">
                        <RelativeTime value={s.detected_at} />
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-text-primary">
                    {headline}
                  </p>
                </div>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="View source"
                    className="shrink-0 text-text-muted transition-colors hover:text-text-secondary"
                  >
                    <ExternalLink size={13} strokeWidth={1.7} />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Cyber lens v1 (2026-06-09 pilot) — group signals by axis
// rather than the buying-trigger split. Each lens reads cleanly through
// a single question:
//   Risk        — what's the live exposure right now?
//   Posture     — how do they behave about security?
//   Maturity    — what capability have they built?
//   Commercial  — what universal B2B events warrant a conversation?
// Plus a fifth "Other" bucket for legacy / unmapped signal_types so
// nothing is lost; the dossier sees everything.
// ---------------------------------------------------------------------------
const AXIS_ORDER: SignalAxis[] = ["risk", "posture", "maturity", "commercial"];
const AXIS_LABEL: Record<SignalAxis, string> = {
  risk: "Risk",
  posture: "Posture",
  maturity: "Maturity",
  commercial: "Commercial",
};
const AXIS_QUESTION: Record<SignalAxis, string> = {
  risk: "Live exposure — breaches, CVEs, dark-web mentions, regulator pressure.",
  posture: "How they behave about security — public stance, transparency, security voice.",
  maturity: "Capability built — security team, leadership, GRC, certifications.",
  commercial: "Universal B2B events — funding, M&A, leadership change, expansion.",
};

function AccountAxisGroups({ signals }: { signals: SignalRow[] }) {
  const filtered = useMemo(() => {
    return signals.filter((s) => {
      const d = s.signal_data ?? {};
      const candidate = String(
        (typeof d.headline === "string" && d.headline) ||
          (typeof d.summary === "string" && d.summary) ||
          (typeof d.quoted_excerpt === "string" && d.quoted_excerpt) ||
          "",
      ).trim();
      // Same freshness + SERP-cruft filters as the buying-triggers list.
      if (isStaleByHeadline(candidate, s.signal_type)) return false;
      if (/^[A-Za-z0-9_\-]+\s+on\s+[A-Za-z0-9_]+$/.test(candidate)) return false;
      return true;
    });
  }, [signals]);

  const byAxis = useMemo(() => {
    const buckets: Record<SignalAxis | "other", SignalRow[]> = {
      risk: [],
      posture: [],
      maturity: [],
      commercial: [],
      other: [],
    };
    for (const s of filtered) {
      const key = (s.axis ?? "other") as SignalAxis | "other";
      buckets[key].push(s);
    }
    return buckets;
  }, [filtered]);

  return (
    <div className="flex flex-col gap-5">
      {/* Lens grid — 2 columns. The cyber lens is always 4 axes (Risk /
          Posture / Maturity / Commercial), so a 2-col grid gives a balanced
          2×2 instead of the 3-col layout's orphaned 4th card + dead space.
          Each axis stays width-constrained with top-N + expand-on-demand so
          the page doesn't feel endless. */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {AXIS_ORDER.map((axis) => {
          const rows = byAxis[axis];
          if (rows.length === 0) return null;
          return <AxisSection key={axis} axis={axis} rows={rows} />;
        })}
      </div>
      <AxisOtherSection rows={byAxis.other} />
    </div>
  );
}

const AXIS_VISIBLE_DEFAULT = 3;

function AxisSection({ axis, rows }: { axis: SignalAxis; rows: SignalRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, AXIS_VISIBLE_DEFAULT);
  const hidden = rows.length - visible.length;
  return (
    <Card className="flex flex-col p-5">
      <SectionHeader
        title={AXIS_LABEL[axis]}
        subtitle={`${rows.length} signal${rows.length === 1 ? "" : "s"} — ${AXIS_QUESTION[axis]}`}
      />
      <ul className="mt-4 flex flex-col gap-2.5">
        {visible.map((s) => (
          <AxisSignalRow key={s.id} s={s} />
        ))}
      </ul>
      {rows.length > AXIS_VISIBLE_DEFAULT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 self-start text-[11.5px] text-text-muted transition-colors hover:text-text-secondary"
        >
          {expanded ? "Show fewer ↑" : `Show ${hidden} more ↓`}
        </button>
      )}
    </Card>
  );
}

function AxisSignalRow({ s }: { s: SignalRow }) {
  const d = s.signal_data ?? {};
  const headline = scrubBackendNames(
    String(
      (typeof d.headline === "string" && d.headline) ||
        (typeof d.summary === "string" && d.summary) ||
        (typeof d.quoted_excerpt === "string" && d.quoted_excerpt) ||
        signalTypeLabel(s.signal_type),
    ),
  );
  const url = typeof d.url === "string" ? d.url : null;
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border-subtle bg-bg-card/40 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="inline-flex shrink-0 items-center rounded-full border border-border-subtle bg-bg-elevated/40 px-2.5 py-0.5 text-[11.5px] font-medium text-text-secondary">
            {signalTypeLabel(s.signal_type)}
          </span>
          {s.detected_at && (
            <span className="text-[11px] text-text-muted">
              <RelativeTime value={s.detected_at} />
            </span>
          )}
        </div>
        <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-text-primary">
          {headline}
        </p>
      </div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View source"
          className="shrink-0 text-text-muted transition-colors hover:text-text-secondary"
        >
          <ExternalLink size={13} strokeWidth={1.7} />
        </a>
      )}
    </li>
  );
}

function AxisOtherSection({ rows }: { rows: SignalRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const byType = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of rows) m.set(s.signal_type, (m.get(s.signal_type) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  if (rows.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start justify-between gap-3 p-7 text-left md:p-8"
      >
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted">
            Other
          </div>
          <div className="mt-2 text-[13.5px] text-text-primary">
            {rows.length} signal{rows.length === 1 ? "" : "s"} — outside the four lenses.
          </div>
          {byType.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {byType.slice(0, 6).map(([type, n]) => (
                <span
                  key={type}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-bg-elevated/40 px-2.5 py-1 text-[11px] text-text-secondary"
                >
                  {signalTypeLabel(type)}
                  <span className="font-mono text-[10px] text-text-muted">{n}</span>
                </span>
              ))}
              {byType.length > 6 && (
                <span className="text-[11px] text-text-muted">+ {byType.length - 6} more</span>
              )}
            </div>
          )}
        </div>
        <span className="shrink-0 text-[11.5px] text-text-muted">
          {expanded ? "Hide ↑" : "Show ↓"}
        </span>
      </button>
      {expanded && (
        <ul className="border-t border-border-subtle">
          {rows.slice(0, 50).map((s) => (
            <AxisSignalRow key={s.id} s={s} />
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3. Other activity — count summary + expand-on-demand
// ---------------------------------------------------------------------------
function AccountOtherActivity({ signals }: { signals: SignalRow[] }) {
  const { signalPriorities } = useOrg();
  const orgTriggerSet = useMemo(
    () => buyingTriggerSetFor(signalPriorities),
    [signalPriorities],
  );
  const [expanded, setExpanded] = useState(false);

  const otherSignals = useMemo(() => {
    return signals
      .filter((s) => !orgTriggerSet.has(s.signal_type))
      .slice(0, 50);
  }, [signals]);

  const byType = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of otherSignals) {
      m.set(s.signal_type, (m.get(s.signal_type) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [otherSignals]);

  if (otherSignals.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start justify-between gap-3 p-7 text-left md:p-8"
      >
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted">
            Other activity
          </div>
          <div className="mt-2 text-[13.5px] text-text-primary">
            {otherSignals.length} signal{otherSignals.length === 1 ? "" : "s"} — research context, not opener-worthy
          </div>
          {byType.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {byType.slice(0, 6).map(([type, n]) => (
                <span
                  key={type}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-bg-elevated/40 px-2.5 py-1 text-[11px] text-text-secondary"
                >
                  {signalTypeLabel(type)}
                  <span className="font-mono text-[10px] text-text-muted">{n}</span>
                </span>
              ))}
              {byType.length > 6 && (
                <span className="text-[11px] text-text-muted">+ {byType.length - 6} more</span>
              )}
            </div>
          )}
        </div>
        <span className="shrink-0 text-[11.5px] text-text-muted">
          {expanded ? "Hide ↑" : "Show ↓"}
        </span>
      </button>
      {expanded && (
        <ul className="border-t border-border-subtle">
          {otherSignals.map((s) => {
            const d = s.signal_data ?? {};
            const headline = scrubBackendNames(
              String(
                (typeof d.headline === "string" && d.headline) ||
                  (typeof d.summary === "string" && d.summary) ||
                  (typeof d.quoted_excerpt === "string" && d.quoted_excerpt) ||
                  signalTypeLabel(s.signal_type),
              ),
            );
            return (
              <li
                key={s.id}
                className="flex items-baseline gap-3 border-b border-border-subtle px-7 py-3 last:border-b-0 md:px-8"
              >
                <span className="shrink-0 text-[11px] font-medium text-text-muted">
                  {signalTypeLabel(s.signal_type)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-secondary">
                  {headline}
                </span>
                {s.detected_at && (
                  <span className="shrink-0 font-mono text-[10.5px] text-text-muted">
                    <RelativeTime value={s.detected_at} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
