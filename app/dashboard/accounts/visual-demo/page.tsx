"use client";

import { useMemo } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useOrg } from "@/components/dashboard/OrgContext";
import {
  Card,
  PageHeader,
  PageShell,
  Shimmer,
} from "@/components/dashboard/primitives";
import { useWatchlist, useWatchlistAlerts } from "@/lib/dashboard/queries";
import { deriveAccountViz } from "@/lib/dashboard/accountViz";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { logoUrl } from "@/lib/logoUrl";
import { SignalWave } from "@/components/dashboard/widgets/viz/SignalWave";
import { SignalDNA } from "@/components/dashboard/widgets/viz/SignalDNA";
import { PostureBricks } from "@/components/dashboard/widgets/viz/PostureBricks";
import { ConvergenceRings } from "@/components/dashboard/widgets/viz/ConvergenceRings";
import { ThreatPostureBalance } from "@/components/dashboard/widgets/viz/ThreatPostureBalance";
import type { AccountVizData } from "@/components/dashboard/widgets/viz/types";

// ---------------------------------------------------------------------------
// Data fetch — pulls everything the 4 visuals need for the visible watchlist.
// ---------------------------------------------------------------------------

interface CompanyMeta {
  domain: string;
  name: string | null;
  industry: string | null;
  hq_country: string | null;
  technologies: unknown[];
  threat_alerts: unknown;
}

interface SignalMini {
  lead_id: string;
  signal_type: string;
  signal_data: Record<string, unknown>;
  detected_at: string;
}

function useDemoData(domains: string[]) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["viz_demo", orgId, [...domains].sort()],
    enabled: !!orgId && domains.length > 0,
    queryFn: async () => {
      const sb = createSupabaseBrowserClient();
      // companies (posture + threat surface)
      const { data: companies } = await sb
        .from("companies")
        .select("domain, name, industry, hq_country, technologies, threat_alerts")
        .in("domain", domains);
      const companyByDom: Record<string, CompanyMeta> = {};
      for (const c of (companies ?? []) as CompanyMeta[]) {
        companyByDom[c.domain.toLowerCase()] = c;
      }

      // leads (so we can join signals → domain)
      const { data: leads } = await sb
        .from("leads")
        .select("id, company_domain")
        .eq("org_id", orgId)
        .in("company_domain", domains);
      const leadDom: Record<string, string> = {};
      for (const l of leads ?? []) {
        if (l.id && l.company_domain) {
          leadDom[l.id] = l.company_domain.toLowerCase();
        }
      }
      const leadIds = Object.keys(leadDom);

      // signals — last 90 days only
      const ninetyDaysAgo = new Date(
        Date.now() - 90 * 24 * 60 * 60 * 1000,
      ).toISOString();
      let signals: SignalMini[] = [];
      if (leadIds.length > 0) {
        const { data: sigs } = await sb
          .from("signals")
          .select("lead_id, signal_type, signal_data, detected_at")
          .in("lead_id", leadIds)
          .gte("detected_at", ninetyDaysAgo)
          .order("detected_at", { ascending: false })
          .limit(800);
        signals = (sigs ?? []) as SignalMini[];
      }
      // index signals by domain
      const sigsByDom: Record<string, SignalMini[]> = {};
      for (const s of signals) {
        const d = leadDom[s.lead_id];
        if (!d) continue;
        (sigsByDom[d] = sigsByDom[d] ?? []).push(s);
      }

      return { companyByDom, sigsByDom };
    },
    staleTime: 60_000,
  });
}

// Derivation lives in lib/dashboard/accountViz.ts and is shared with the
// main /dashboard/accounts page so the wave behaves identically in both
// surfaces.

// ---------------------------------------------------------------------------
// Logo (mirrors AccountRow's helper)
// ---------------------------------------------------------------------------

function CompanyLogo({ domain }: { domain: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl(domain, 128)}
      alt=""
      width={28}
      height={28}
      className="h-7 w-7 shrink-0 rounded-md border border-border-subtle bg-white object-contain p-1"
    />
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function VisualDemoPage() {
  const { features } = useOrg();
  if (!features.accounts_dashboard) notFound();

  const { data: watchlist, isLoading: wLoad } = useWatchlist();
  useWatchlistAlerts(); // pre-warm cache; not used in this page directly

  const domains = useMemo(
    () =>
      (watchlist ?? [])
        .map((w) => (w.company_domain ?? "").toLowerCase())
        .filter(Boolean),
    [watchlist],
  );

  const { data: demo, isLoading: dLoad } = useDemoData(domains);

  const rows = useMemo(() => {
    return (watchlist ?? []).map((w) => {
      const dom = (w.company_domain ?? "").toLowerCase();
      const company = demo?.companyByDom[dom];
      const sigs = demo?.sigsByDom[dom] ?? [];
      const viz = deriveAccountViz(
        dom,
        company
          ? {
              technologies: company.technologies,
              threat_alerts: company.threat_alerts,
            }
          : undefined,
        sigs,
      );
      return {
        domain: dom,
        name: company?.name ?? w.company_name ?? dom,
        industry: company?.industry ?? null,
        viz,
      };
    });
  }, [watchlist, demo]);

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
        <span className="font-mono text-[12px] text-text-secondary">
          visual demo
        </span>
      </div>

      <PageHeader
        eyebrow="Design comparison"
        title="Account intelligence at a glance"
        subtitle="Same accounts, different visual languages. Pick one and we'll wire it into the main table."
      />

      {/* Recommended first — wider, more screen real estate */}
      <div className="mt-8">
        <ConceptCard
          name="Signal Wave  ·  recommended"
          subtitle="Activity over 90 days. Dots are individual signal events; the wave traces their density. Colour is derived from where the dots cluster: emerald = active buying-window, amber = warming, rose = threat-led (proceed carefully), grey = quiet. One glance answers 'is this heating up, cooling down, or burning?'."
        >
          <ComparisonTable
            rows={rows}
            loading={wLoad || dLoad}
            render={(viz) => <SignalWave data={viz} />}
            labelHeader="Wave"
            vizColWidth={170}
          />
        </ConceptCard>
      </div>

      <div className="mt-8 mb-3 font-mono text-[10.5px] uppercase tracking-[0.22em] text-text-muted">
        Other concepts for comparison
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ConceptCard
          name="Signal DNA"
          subtitle="Vertical bars per category — the SHAPE tells the story (hiring-heavy vs threat-heavy vs funding-led)."
        >
          <ComparisonTable
            rows={rows}
            loading={wLoad || dLoad}
            render={(viz) => <SignalDNA data={viz} />}
            labelHeader="DNA"
          />
        </ConceptCard>

        <ConceptCard
          name="Posture bricks"
          subtitle="5 security categories × 3 states (covered / exposed / hiring). Reads like a cyber x-ray."
        >
          <ComparisonTable
            rows={rows}
            loading={wLoad || dLoad}
            render={(viz) => <PostureBricks data={viz} />}
            labelHeader="Bricks"
          />
        </ConceptCard>

        <ConceptCard
          name="Convergence rings"
          subtitle="Time-bucketed events: 90d → 30d → 7d (outer to inner). Clustering in the inner ring = action now."
        >
          <ComparisonTable
            rows={rows}
            loading={wLoad || dLoad}
            render={(viz) => <ConvergenceRings data={viz} />}
            labelHeader="Rings"
          />
        </ConceptCard>

        <ConceptCard
          name="Threat ↔ Posture balance"
          subtitle="Single horizontal bar: green segments (covered) vs red (exposed). Imbalance = vendor opportunity."
        >
          <ComparisonTable
            rows={rows}
            loading={wLoad || dLoad}
            render={(viz) => <ThreatPostureBalance data={viz} />}
            labelHeader="Balance"
          />
        </ConceptCard>
      </div>
    </PageShell>
  );
}

function ConceptCard({
  name,
  subtitle,
  children,
}: {
  name: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-6">
      <div className="mb-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">
          Concept
        </div>
        <h2 className="mt-1.5 font-display text-[1.05rem] font-medium tracking-tight text-text-primary">
          {name}
        </h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">
          {subtitle}
        </p>
      </div>
      {children}
    </Card>
  );
}

function ComparisonTable({
  rows,
  loading,
  render,
  labelHeader,
  vizColWidth = 120,
}: {
  rows: { domain: string; name: string; industry: string | null; viz: AccountVizData }[];
  loading: boolean;
  render: (viz: AccountVizData) => React.ReactNode;
  labelHeader: string;
  vizColWidth?: number;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Shimmer key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
    );
  }
  const cols = `1fr ${vizColWidth}px`;
  return (
    <div className="overflow-hidden rounded-xl border border-border-subtle">
      <div
        className="grid items-center gap-x-4 border-b border-border-subtle bg-bg-elevated/30 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted"
        style={{ gridTemplateColumns: cols }}
      >
        <span>Account</span>
        <span className="text-right">{labelHeader}</span>
      </div>
      {rows.map((r) => (
        <div
          key={r.domain}
          className="grid items-center gap-x-4 border-b border-border-subtle/70 px-3 py-3 last:border-b-0"
          style={{ gridTemplateColumns: cols }}
        >
          <div className="flex items-center gap-2.5">
            <CompanyLogo domain={r.domain} />
            <div className="min-w-0">
              <div className="truncate font-display text-[13px] font-medium text-text-primary">
                {r.name}
              </div>
              {r.industry && (
                <div className="truncate text-[11px] text-text-muted">
                  {r.industry}
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end">{render(r.viz)}</div>
        </div>
      ))}
    </div>
  );
}
