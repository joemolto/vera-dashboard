"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Eye,
  ShieldAlert,
  Sparkles,
  Users,
  TrendingUp,
  Scale,
} from "lucide-react";
import {
  Card,
  EmptyState,
  PageShell,
  Pill,
  RelativeTime,
  SectionHeader,
  Shimmer,
} from "@/components/dashboard/primitives";
import { signalMeta } from "@/lib/dashboard/signalTaxonomy";
import { scrubBackendNames } from "@/lib/dashboard/labels";
import {
  useCompanyIntelligence,
  useCompanyPeople,
  type CompanyIntelRow,
  type CompanyPerson,
  type CompanyThreatSurfaceRow,
} from "@/lib/dashboard/queries";
import { useOrg } from "@/components/dashboard/OrgContext";
import { ExternalLink, Loader2 } from "lucide-react";

export default function CompanyIntelligencePage() {
  const params = useParams<{ domain: string }>();
  const domain = decodeURIComponent(params?.domain ?? "").toLowerCase();
  const { data, isLoading, error } = useCompanyIntelligence(domain);

  return (
    <PageShell>
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-[13px] text-text-muted hover:text-text-primary"
        >
          <ArrowLeft size={14} aria-hidden />
          Dashboard
        </Link>
        <span className="text-text-muted">/</span>
        <span className="font-mono text-[12px] text-text-secondary">
          {domain}
        </span>
      </div>

      {isLoading && <LoadingState />}

      {error && (
        <Card className="p-8">
          <EmptyState
            icon={<ShieldAlert size={18} />}
            title="Couldn’t load company intelligence"
            body={
              error instanceof Error
                ? error.message
                : "Try refreshing in a moment."
            }
          />
        </Card>
      )}

      {!isLoading && !error && data && (
        <CompanyView data={data} domain={domain} />
      )}
    </PageShell>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-5">
      <Shimmer className="h-40 w-full rounded-2xl" />
      <Shimmer className="h-32 w-full rounded-2xl" />
      <Shimmer className="h-64 w-full rounded-2xl" />
    </div>
  );
}

function CompanyView({
  data,
  domain,
}: {
  data: ReturnType<typeof useCompanyIntelligence>["data"] extends infer T
    ? T extends undefined
      ? never
      : T
    : never;
  domain: string;
}) {
  const { company, signals, threats, anonymized_watcher_count } = data;

  if (!company) {
    return (
      <Card className="p-8">
        <EmptyState
          icon={<Sparkles size={18} />}
          title="No intelligence yet"
          body={`Vera hasn’t enriched ${domain} yet. Once any client enriches a lead at this domain, intelligence will start landing here.`}
        />
      </Card>
    );
  }

  const rollupBadges: { label: string; active: boolean }[] = [
    { label: "Recent funding", active: !!company.has_recent_funding },
    {
      label: "Security team growing",
      active: !!company.has_security_team_growth,
    },
    {
      label: "Compliance signal",
      active: !!company.has_compliance_signal,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Header / overview */}
      <Card className="p-7 md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-text-muted">
              Company intelligence
            </div>
            <h1 className="mt-2 font-display text-[1.5rem] font-medium tracking-tight text-text-primary md:text-[1.7rem]">
              {company.name ?? domain}
            </h1>
            <div className="mt-1 font-mono text-[12.5px] text-text-secondary">
              {company.domain}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 text-[13px] text-text-secondary md:grid-cols-3">
              {company.industry && (
                <Fact icon={Building2} label="Industry" value={company.industry} />
              )}
              {company.size_band && (
                <Fact
                  icon={Users}
                  label="Headcount"
                  value={company.size_band}
                />
              )}
              {company.hq_country && (
                <Fact icon={Scale} label="Country" value={company.hq_country} />
              )}
            </div>
          </div>

          {/* Network signal — anonymised count of other clients watching */}
          {anonymized_watcher_count > 0 && (
            <div className="rounded-xl border border-border-default bg-bg-elevated/40 px-5 py-4">
              <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-muted">
                <Eye size={12} aria-hidden />
                Across the network
              </div>
              <div className="mt-1.5 text-[14.5px] text-text-primary">
                Watched by {anonymized_watcher_count} other Vera client
                {anonymized_watcher_count === 1 ? "" : "s"}
              </div>
            </div>
          )}
        </div>

        {/* Roll-up badges */}
        <div className="mt-5 flex flex-wrap gap-2">
          {rollupBadges.map((b) => (
            <Pill
              key={b.label}
              variant={b.active ? "accent" : "muted"}
              className="!normal-case !tracking-normal"
            >
              {b.active ? "✓ " : "— "}
              {b.label}
            </Pill>
          ))}
        </div>
      </Card>

      {/* Signal timeline */}
      <Card className="p-7 md:p-8">
        <SectionHeader
          title="Signal timeline"
          subtitle="What Vera has observed across the network"
        />
        {signals.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<Sparkles size={18} />}
              title="No signals observed yet"
              body="Signals land here as Vera enriches leads at this company across the network."
            />
          </div>
        ) : (
          <ul className="mt-5 flex flex-col gap-3">
            {signals.map((s, i) => (
              <SignalRow key={`${s.signal_type}-${i}`} signal={s} />
            ))}
          </ul>
        )}
      </Card>

      {/* Threat surface */}
      {threats.length > 0 && (
        <Card className="p-7 md:p-8">
          <SectionHeader
            title="Relevant threat intelligence"
            subtitle="Cross-client surface"
          />
          <ul className="mt-5 flex flex-col gap-3">
            {threats.map((t, i) => (
              <ThreatRow key={i} item={t} />
            ))}
          </ul>
        </Card>
      )}

      {/* People at this account — only on the account-first dashboard. */}
      <PeopleAtAccountGated domain={domain} />
    </div>
  );
}

function PeopleAtAccountGated({ domain }: { domain: string }) {
  const { features } = useOrg();
  if (!features.accounts_dashboard) return null;
  return <PeopleAtAccount domain={domain} />;
}

function PeopleAtAccount({ domain }: { domain: string }) {
  const { data, isLoading, isError, error } = useCompanyPeople(domain, {
    limit: 25,
  });
  const people = data?.people ?? [];

  return (
    <Card className="p-7 md:p-8">
      <SectionHeader
        title="People at this account"
        subtitle="Surfaced by Vera — who works here, what they do"
        right={
          data ? (
            <Pill variant="muted">{data.total} surfaced</Pill>
          ) : undefined
        }
      />
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
      {!isLoading && !isError && people.length === 0 && (
        <div className="mt-5">
          <EmptyState
            icon={<Users size={18} />}
            title="No people surfaced yet"
            body="Vera couldn’t find people at this domain. Try again once enrichment has run."
          />
        </div>
      )}
      {people.length > 0 && (
        <ul className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
          {people.map((p, i) => (
            <PersonRow key={p.apollo_id ?? i} person={p} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function PersonRow({ person }: { person: CompanyPerson }) {
  const fullName = [person.first_name, person.last_name]
    .filter(Boolean)
    .join(" ") || "(unknown name)";
  const location = [person.city, person.state, person.country]
    .filter(Boolean)
    .join(", ");
  return (
    <li className="rounded-xl border border-border-subtle bg-bg-elevated/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-display text-[14px] font-medium text-text-primary">
            {fullName}
          </div>
          {person.title && (
            <div className="mt-0.5 truncate text-[12.5px] text-text-secondary">
              {person.title}
            </div>
          )}
          {location && (
            <div className="mt-1 text-[11.5px] text-text-muted">{location}</div>
          )}
        </div>
        {person.linkedin_url && (
          <a
            href={person.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-text-muted transition hover:text-text-primary"
            aria-label={`Open ${fullName}'s LinkedIn`}
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>
      {person.seniority && (
        <div className="mt-2">
          <Pill variant="muted">{person.seniority}</Pill>
        </div>
      )}
    </li>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={13} strokeWidth={1.8} className="mt-0.5 text-text-muted" />
      <div className="min-w-0">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
          {label}
        </div>
        <div className="truncate text-text-primary">{value}</div>
      </div>
    </div>
  );
}

function SignalRow({ signal }: { signal: CompanyIntelRow }) {
  const meta = signalMeta(signal.signal_type);
  const Icon = meta.Icon;
  const headline =
    (signal.signal_data?.headline as string | undefined) ??
    signal.signal_type.replace(/_/g, " ");
  const detail = signal.signal_data?.detail as string | undefined;

  return (
    <li className="flex items-start gap-3 rounded-xl border border-border-subtle bg-bg-elevated/30 p-4">
      <div
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${meta.bg}`}
      >
        <Icon size={15} strokeWidth={1.7} className={meta.color} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Pill variant="outline" className="!normal-case !tracking-normal">
            {meta.label}
          </Pill>
          {signal.observed_count > 1 && (
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
              confirmed {signal.observed_count}×
            </span>
          )}
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
            <RelativeTime value={signal.latest_observed_at} />
          </span>
        </div>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-primary">
          {scrubBackendNames(headline)}
        </p>
        {detail && (
          <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">
            {scrubBackendNames(detail)}
          </p>
        )}
      </div>
    </li>
  );
}

function ThreatRow({ item }: { item: CompanyThreatSurfaceRow }) {
  const ti = item.threat_intel;
  if (!ti) return null;
  return (
    <li className="rounded-xl border border-border-subtle bg-bg-elevated/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {ti.severity && (
          <Pill
            variant={
              ti.severity === "critical" || ti.severity === "high"
                ? "danger"
                : "warning"
            }
            className="!normal-case !tracking-normal"
          >
            {ti.severity}
          </Pill>
        )}
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
          {ti.source}
        </span>
        {item.org_alert_count > 0 && (
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
            {item.org_alert_count} client
            {item.org_alert_count === 1 ? "" : "s"} alerted
          </span>
        )}
      </div>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-primary">
        {ti.title}
      </p>
      {ti.description && (
        <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">
          {ti.description}
        </p>
      )}
      {ti.url && (
        <a
          href={ti.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-[12px] text-accent hover:underline"
        >
          source ↗
        </a>
      )}
    </li>
  );
}
