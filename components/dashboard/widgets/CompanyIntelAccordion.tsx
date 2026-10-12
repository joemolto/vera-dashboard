"use client";

import { motion } from "framer-motion";
import {
  Building2,
  ChevronDown,
  Coins,
  Newspaper,
  ShieldCheck,
  Wrench,
  Briefcase,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Pill } from "@/components/dashboard/primitives";
import { scrubBackendNames } from "@/lib/dashboard/labels";
import { cn } from "@/lib/utils";
import type {
  EnrichmentData,
  TechItem,
  NewsStory,
  FundingRound,
} from "@/lib/dashboard/types";

const COMPLIANCE_ORDER = [
  "iso_27001",
  "soc_2",
  "cyber_essentials",
  "cyber_essentials_plus",
  "pci_dss",
  "crest",
  "check",
];

const COMPLIANCE_LABEL: Record<string, string> = {
  iso_27001: "ISO 27001",
  soc_2: "SOC 2",
  cyber_essentials: "Cyber Essentials",
  cyber_essentials_plus: "Cyber Essentials Plus",
  pci_dss: "PCI DSS",
  crest: "CREST",
  check: "CHECK",
};

function isPositive(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const s = v.toLowerCase();
  return s !== "" && s !== "not found" && s !== "no" && s !== "none";
}

function compactNum(n: string | number | undefined | null): string {
  if (n === null || n === undefined || n === "") return "—";
  if (typeof n === "number") {
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n}`;
  }
  return String(n);
}

export function CompanyIntelAccordion({
  enrichment,
}: {
  enrichment: EnrichmentData;
}) {
  const tech = enrichment.tech_stack;
  const news = enrichment.news?.key_stories ?? [];
  const rounds = enrichment.predictleads_financing?.rounds ?? [];
  const compliance = enrichment.deep_research?.compliance ?? {};
  // Prefer the merged top-level business_intel (Apollo + Sonar combined).
  // Fall back to legacy deep_research.business_intel for records enriched
  // before the merge was wired in.
  const businessIntel =
    enrichment.business_intel ?? enrichment.deep_research?.business_intel;
  const jobs = enrichment.jobs;

  const techCount = tech?.total_detected ?? tech?.technologies_detected?.length ?? 0;
  const certCount = COMPLIANCE_ORDER.filter((k) => isPositive(compliance[k])).length;
  const hiringFlags = [
    jobs?.is_hiring_sales_bd && "Sales/BD",
    jobs?.is_hiring_leadership && "Leadership",
    jobs?.is_hiring_technical && "Technical",
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-3">
      <Section
        Icon={Wrench}
        title="Tech stack"
        meta={techCount ? `${techCount} detected` : "—"}
        defaultOpen={false}
        empty={!tech || techCount === 0}
        emptyText="No tech stack detected"
      >
        {tech && <TechStackBody tech={tech} />}
      </Section>

      <Section
        Icon={Newspaper}
        title="Recent news"
        meta={news.length ? `${news.length} stories` : "—"}
        defaultOpen={news.length > 0 && news.length <= 4}
        empty={news.length === 0}
        emptyText="No recent news found"
      >
        <NewsBody stories={news} />
      </Section>

      <Section
        Icon={Briefcase}
        title="Hiring activity"
        meta={
          jobs?.total_roles_found
            ? `${jobs.total_roles_found} open roles`
            : "—"
        }
        defaultOpen={false}
        empty={!jobs || (jobs.total_roles_found ?? 0) === 0}
        emptyText="No open roles detected"
      >
        {jobs && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {/* Show category pills when at least one key role is flagged.
                  When jobs.total_roles_found > 0 but none of the categories
                  flagged, render nothing here rather than the misleading
                  "Not hiring · key roles" pill — the meta count already
                  shows the rep that hiring is happening. */}
              {hiringFlags.map((f) => (
                <Pill key={f} variant="accent" className="!normal-case !tracking-normal">
                  {f}
                </Pill>
              ))}
              {jobs.hiring_velocity && (
                <Pill variant="outline">
                  Velocity · {jobs.hiring_velocity}
                </Pill>
              )}
            </div>
            {jobs.hiring_velocity_notes && (
              <p className="text-[12.5px] leading-relaxed text-text-secondary">
                {scrubBackendNames(jobs.hiring_velocity_notes)}
              </p>
            )}
          </div>
        )}
      </Section>

      <Section
        Icon={Coins}
        title="Funding"
        meta={rounds.length ? `${rounds.length} rounds` : "—"}
        defaultOpen={false}
        empty={rounds.length === 0}
        emptyText="No funding history detected"
      >
        <FundingBody rounds={rounds} />
      </Section>

      <Section
        Icon={ShieldCheck}
        title="Compliance & certifications"
        meta={certCount ? `${certCount} certs` : "—"}
        defaultOpen={false}
        empty={
          certCount === 0 &&
          ((compliance.other_certifications as string[] | undefined) ?? []).length === 0
        }
        emptyText="No certifications detected"
      >
        <ComplianceBody compliance={compliance} />
      </Section>

      <Section
        Icon={Building2}
        title="Business intel"
        meta=""
        defaultOpen={false}
        empty={!businessIntel}
        emptyText="No business intel detected"
      >
        {businessIntel && <BusinessIntelBody bi={businessIntel} />}
      </Section>
    </div>
  );
}

function Section({
  Icon,
  title,
  meta,
  defaultOpen,
  empty,
  emptyText,
  children,
}: {
  Icon: typeof Building2;
  title: string;
  meta: string;
  defaultOpen: boolean;
  empty: boolean;
  emptyText: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-2xl border border-border-default bg-bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-6 py-4 text-left transition-colors hover:bg-bg-elevated/30"
      >
        <Icon size={14} strokeWidth={1.7} className="shrink-0 text-text-muted" />
        <span className="font-display text-[14px] font-medium tracking-tight text-text-primary">
          {title}
        </span>
        <span className="ml-auto flex items-center gap-3">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-muted">
            {meta || (empty ? "empty" : "")}
          </span>
          <ChevronDown
            size={14}
            strokeWidth={1.7}
            className={cn(
              "text-text-muted transition-transform",
              open && "rotate-180",
            )}
          />
        </span>
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.25 }}
          className="border-t border-border-subtle px-6 py-5"
        >
          {empty ? (
            <p className="text-[12.5px] text-text-muted">{emptyText}</p>
          ) : (
            children
          )}
        </motion.div>
      )}
    </div>
  );
}

function TechStackBody({
  tech,
}: {
  tech: NonNullable<EnrichmentData["tech_stack"]>;
}) {
  const techs: TechItem[] = tech.technologies_detected ?? [];
  const grouped = new Map<string, TechItem[]>();
  for (const t of techs) {
    const cat = t.category ?? "other";
    grouped.set(cat, [...(grouped.get(cat) ?? []), t]);
  }
  const cats = [...grouped.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );

  return (
    <div className="flex flex-col gap-4">
      {cats.map(([cat, items]) => (
        <div key={cat}>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">
            {cat.replace(/_/g, " ")}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {items.map((t, i) => (
              <span
                key={`${t.name}-${i}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] tracking-tight",
                  t.behind_firewall
                    ? "border-accent/35 bg-accent/8 text-accent"
                    : "border-border-subtle bg-bg-elevated/50 text-text-secondary",
                )}
              >
                {t.name}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function NewsBody({ stories }: { stories: NewsStory[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {stories.slice(0, 8).map((s, i) => (
        <li
          key={i}
          className="flex items-start gap-3 rounded-lg border border-border-subtle bg-bg-elevated/30 p-3.5"
        >
          <Newspaper
            size={12}
            strokeWidth={1.7}
            className="mt-1 shrink-0 text-text-muted"
          />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] tracking-tight text-text-primary">
              {s.headline}
            </div>
            <div className="mt-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
              {s.category && <Pill variant="muted">{s.category}</Pill>}
              {s.source}
              {s.date &&
                ` · ${new Date(s.date).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}`}
            </div>
            {s.summary && (
              <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-text-secondary">
                {s.summary}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function FundingBody({ rounds }: { rounds: FundingRound[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {rounds.map((r, i) => (
        <li
          key={i}
          className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-bg-elevated/30 px-3.5 py-3"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-display text-[13px] font-medium tracking-tight text-text-primary">
                {r.type ?? "Round"}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-text-secondary">
                {compactNum(r.amount)}
              </span>
            </div>
            {r.investors && r.investors.length > 0 && (
              <div className="mt-0.5 truncate text-[11.5px] text-text-muted">
                {r.investors.join(", ")}
              </div>
            )}
          </div>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-muted">
            {r.date
              ? new Date(r.date).toLocaleDateString(undefined, {
                  month: "short",
                  year: "numeric",
                })
              : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ComplianceBody({
  compliance,
}: {
  compliance: Record<string, string | string[] | null>;
}) {
  const others = (compliance.other_certifications ?? []) as string[];

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {COMPLIANCE_ORDER.map((k) => {
          const positive = isPositive(compliance[k]);
          return (
            <div
              key={k}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2",
                positive
                  ? "border-accent/30 bg-accent/5"
                  : "border-border-subtle bg-bg-elevated/30",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  positive ? "bg-accent" : "bg-text-muted/50",
                )}
              />
              <span
                className={cn(
                  "text-[12px] tracking-tight",
                  positive ? "text-text-primary" : "text-text-muted",
                )}
              >
                {COMPLIANCE_LABEL[k]}
              </span>
            </div>
          );
        })}
      </div>
      {others.length > 0 && (
        <div className="mt-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">
            Other certifications
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {others.map((c) => (
              <Pill key={c} variant="accent" className="!normal-case !tracking-normal">
                {c}
              </Pill>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BusinessIntelBody({
  bi,
}: {
  bi: NonNullable<EnrichmentData["business_intel"]>;
}) {
  // Revenue: prefer the human-readable "693M" form; fall back to numeric or
  // Sonar's free-text estimated_revenue.
  const revenue =
    bi.annual_revenue_printed ??
    (typeof bi.annual_revenue === "number" ? `$${formatCompact(bi.annual_revenue)}` : undefined) ??
    bi.estimated_revenue;

  const funding =
    bi.total_funding_printed ??
    (typeof bi.total_funding === "number" ? `$${formatCompact(bi.total_funding)}` : undefined);

  const fundingStage = [bi.latest_funding_stage, bi.latest_funding_round_date]
    .filter(Boolean)
    .join(" · ");

  const headcountGrowth = formatHeadcountGrowth(
    bi.headcount_twelve_month_growth ?? bi.headcount_six_month_growth,
    bi.headcount_twelve_month_growth != null ? "12m" : "6m",
  );

  const publicListing =
    bi.publicly_traded_symbol && bi.publicly_traded_exchange
      ? `${bi.publicly_traded_exchange}: ${bi.publicly_traded_symbol}`
      : bi.publicly_traded_symbol;

  return (
    <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Field label="Founded" value={bi.founded_year ? String(bi.founded_year) : undefined} />
      <Field label="Headcount" value={bi.estimated_num_employees?.toLocaleString()} />
      <Field label="Annual revenue" value={revenue} />
      <Field label="Total funding" value={funding} />
      <Field label="Latest round" value={fundingStage || undefined} />
      <Field label="Public listing" value={publicListing} />
      <Field label="Headcount growth" value={headcountGrowth} />
      <Field
        label="Key customers"
        value={
          bi.key_customers && bi.key_customers.length > 0
            ? bi.key_customers.join(", ")
            : undefined
        }
      />
      <Field
        label="Competitors"
        value={
          bi.competitors && bi.competitors.length > 0
            ? bi.competitors.join(", ")
            : undefined
        }
      />
      <Field
        label="Recent awards"
        value={
          bi.recent_awards && bi.recent_awards.length > 0
            ? bi.recent_awards.join(", ")
            : undefined
        }
      />
    </dl>
  );
}

function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function formatHeadcountGrowth(
  fraction: number | undefined,
  window: string,
): string | undefined {
  if (fraction == null || !Number.isFinite(fraction)) return undefined;
  const pct = Math.round(fraction * 100);
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}% (${window})`;
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | undefined;
}) {
  const display =
    !value || value === "Not found" ? (
      <span className="text-text-muted">—</span>
    ) : (
      <span className="text-text-primary">{value}</span>
    );
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
      <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 truncate text-right">{display}</dd>
    </div>
  );
}
