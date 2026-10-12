"use client";

/**
 * AccountDrawer — slide-in preview panel for an account row.
 *
 * Clicking any account row opens this drawer
 * instead of navigating to the full account page. Lets reps triage
 * multiple accounts without losing scroll position in the table.
 * The "View account" button at the top of the drawer is how the rep
 * gets to the full page when they want the deeper tabs (People,
 * Cyber profile, full Signals timeline).
 *
 * Renders entirely from the AccountRowData already passed to the
 * table — no extra query. Keeps the drawer instant to open.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Building2,
  Calendar,
  Check,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  Users,
  X,
  Radar,
  Pause,
  Play,
  KeyRound,
} from "lucide-react";
import {
  RelativeTime,
  SectionHeader,
  Shimmer,
} from "@/components/dashboard/primitives";
import { useOrg } from "@/components/dashboard/OrgContext";
import { useTargetTitles, useSetMonitoring, useUnlockContact } from "@/lib/dashboard/queries";
import { useDismissedContacts, useDismissContact } from "@/lib/dashboard/relevanceFeedback";
import { SlideToConfirm } from "@/components/ui/SlideToConfirm";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  humanizeLabel,
  scrubBackendNames,
  SOCIAL_CHIP_LABELS,
} from "@/lib/dashboard/labels";
import { formatSizeBand } from "@/lib/dashboard/sizeBand";
import { logoUrl } from "@/lib/logoUrl";
import { cn } from "@/lib/utils";
import type {
  AccountRowData,
  CredentialExposureSummary,
} from "@/components/dashboard/widgets/AccountRow";

interface PersonRow {
  apollo_id: string | null;
  first_name: string;
  last_name: string;
  last_name_obfuscated: string;
  title: string;
  seniority: string;
  linkedin_url: string;
  city: string;
  country: string;
  has_email: boolean;
  has_phone: boolean;
  email: string | null;
  unlocked: boolean;
  relevance_score?: number;
  relevance_reason?: string;
}

// Fetches ICP-matched people at the given domain via the same
// apollo-people edge function used by AccountPeopleDrawer. Lazy:
// only fires when the drawer is open AND a domain is set.
function usePeopleAtAccount(domain: string | null, titles: string[]) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: [
      "apollo_people_account_drawer",
      orgId,
      domain,
      [...titles].sort().join("|"),
    ],
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

// Map apollo_id → lead_id for this account's already-unlocked contacts, so an
// unlocked drawer card can link straight to its lead page. Mirrors the full
// account page's apolloToLead map. Lazy: only when the drawer has a domain.
function useLeadIdsAtAccount(domain: string | null) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["drawer_lead_ids", orgId, domain],
    enabled: !!orgId && !!domain,
    queryFn: async () => {
      const sb = createSupabaseBrowserClient();
      const { data, error } = await sb
        .from("leads")
        .select("id, apollo_id")
        .eq("org_id", orgId)
        .ilike("company_domain", domain as string);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const l of (data ?? []) as { id: string; apollo_id: string | null }[]) {
        if (l.apollo_id) map[l.apollo_id] = l.id;
      }
      return map;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

const SOCIAL_TYPE_TONE: Record<string, string> = {
  social_breach_mention: "border-red-400/40 bg-red-400/10 text-red-300",
  social_leadership_change: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  social_funding_news: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  social_milestone: "border-teal-400/40 bg-teal-400/10 text-teal-300",
  social_employee_chatter: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  social_company_post: "border-blue-400/40 bg-blue-400/10 text-blue-300",
  social_hiring_buzz: "border-cyan-400/40 bg-cyan-400/10 text-cyan-300",
  social_vendor_relationship: "border-violet-400/40 bg-violet-400/10 text-violet-300",
  social_complaint: "border-rose-400/40 bg-rose-400/10 text-rose-300",
  social_customer_review: "border-lime-400/40 bg-lime-400/10 text-lime-300",
  social_company_mention: "border-border-default bg-bg-elevated text-text-secondary",
};

function ExposureStat({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-elevated/50 px-2.5 py-2">
      <div
        className={cn(
          "font-display text-[16px] font-medium tabular-nums",
          value > 0 && strong ? "text-rose-300" : "text-text-primary",
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-text-muted">
        {label}
      </div>
    </div>
  );
}

/** Credential exposure (LeakRadar stealer-log / dark-web) panel. Renders only
 * when there's any exposure. Leads with recent employee exposure (the live
 * Risk signal), then the employees / third-parties / customers breakdown.
 * Counts only — credentials are never revealed. */
function CredentialExposurePanel({ ce }: { ce: CredentialExposureSummary | null }) {
  if (!ce) return null;
  const employees = ce.employees_compromised || 0;
  const recent = ce.recent_employees_90d || 0;
  const thirdParties = ce.third_parties_compromised || 0;
  const customers = ce.customers_compromised || 0;
  if (employees + thirdParties + customers <= 0) return null;

  const passwords = Boolean(ce.employee_passwords_captured);
  const when =
    typeof ce.most_recent_surfaced === "string" && ce.most_recent_surfaced.length >= 7
      ? ce.most_recent_surfaced.slice(0, 7)
      : null;

  return (
    <section className="mb-7">
      <div className="rounded-xl border border-rose-400/25 bg-rose-400/[0.06] p-4">
        <div className="mb-2.5 flex items-center gap-1.5">
          <KeyRound size={12} strokeWidth={1.8} className="text-rose-300" aria-hidden />
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-rose-300">
            Credential exposure
          </span>
          <span className="text-[11px] text-text-muted">stealer logs / dark web</span>
        </div>

        {recent > 0 ? (
          <p className="text-[13.5px] leading-relaxed text-text-primary">
            <span className="font-medium tabular-nums">{recent}</span> employee credential
            {recent === 1 ? "" : "s"} surfaced in the last 90 days
            {when ? ` · most recent ${when}` : ""}
            {passwords && (
              <span className="ml-1.5 whitespace-nowrap rounded border border-rose-400/30 bg-rose-400/10 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-rose-300">
                passwords captured
              </span>
            )}
          </p>
        ) : employees > 0 ? (
          <p className="text-[13px] leading-relaxed text-text-secondary">
            {employees} employee credential{employees === 1 ? "" : "s"} exposed historically —
            none in the last 90 days.
          </p>
        ) : null}

        <div className="mt-3 grid grid-cols-3 gap-2">
          <ExposureStat label="Employees" value={employees} strong />
          <ExposureStat label="Third parties" value={thirdParties} />
          <ExposureStat label="Customers" value={customers} />
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
          Exposure counts only — Vera never reveals the credentials themselves.
        </p>
      </div>
    </section>
  );
}

export function AccountDrawer({
  data,
  onClose,
}: {
  data: AccountRowData | null;
  onClose: () => void;
}) {
  const open = data !== null;
  // Lock scroll on the underlying page when the drawer is open.
  // Avoids the body scrolling while the rep interacts with the panel.

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-bg-base/60 backdrop-blur-sm transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-label={data ? `${data.name} preview` : "Account preview"}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border-default bg-bg-card shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.4)] transition-transform duration-200 sm:max-w-lg",
          open ? "translate-x-0" : "translate-x-full",
        )}
        aria-hidden={!open}
      >
        {data ? <DrawerBody data={data} onClose={onClose} /> : <DrawerSkeleton />}
      </aside>
    </>
  );
}

function DrawerSkeleton() {
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <Shimmer className="h-6 w-2/3" />
      <Shimmer className="h-4 w-full" />
      <Shimmer className="h-32 w-full" />
    </div>
  );
}

function DrawerBody({
  data,
  onClose,
}: {
  data: AccountRowData;
  onClose: () => void;
}) {
  const { data: targetTitles } = useTargetTitles();
  const titles = targetTitles ?? [];
  const {
    data: peopleData,
    isLoading: peopleLoading,
    isError: peopleError,
  } = usePeopleAtAccount(data.domain, titles);
  const { data: leadIdByApollo } = useLeadIdsAtAccount(data.domain);
  const people = peopleData?.people ?? [];
  const { data: dismissedContacts } = useDismissedContacts();

  return (
    <>
      {/* Tinted hero band — soft accent gradient, close button floats
          top-right. Centered logo + name + meta gives the panel an
          intentional moment of arrival before the data sections. */}
      <div className="relative shrink-0 border-b border-border-subtle bg-gradient-to-b from-accent/[0.06] via-accent/[0.02] to-transparent px-6 pb-7 pt-10">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-md p-1.5 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
        >
          <X size={16} strokeWidth={1.8} />
        </button>

        <div className="flex flex-col items-center text-center">
          <CompanyLogo domain={data.domain} name={data.name} />
          <h2 className="mt-4 font-display text-[20px] font-medium leading-tight tracking-tight text-text-primary">
            {data.name}
          </h2>
          {(data.industry || data.country || data.size_band) && (
            <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[12.5px] text-text-secondary">
              {data.industry && <span>{humanizeLabel(data.industry)}</span>}
              {data.industry && (data.country || data.size_band) && (
                <span className="text-text-muted">·</span>
              )}
              {data.country && <span>{data.country}</span>}
              {data.country && data.size_band && (
                <span className="text-text-muted">·</span>
              )}
              {data.size_band && <span>{formatSizeBand(data.size_band)}</span>}
            </div>
          )}
          <div className="mt-2 inline-flex items-center gap-1.5 font-mono text-[11px] text-text-muted">
            <Globe size={10} strokeWidth={1.7} aria-hidden />
            <span>{data.domain}</span>
          </div>

          {/* Primary CTA — pill, centered. Accent-styled to read as the
              main next-action without competing with the close button. */}
          <Link
            href={`/dashboard/accounts/${encodeURIComponent(data.domain)}`}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-text-primary px-5 py-2 text-[13px] font-medium tracking-tight text-bg-base transition-opacity hover:opacity-90"
          >
            View account
            <ArrowUpRight size={13} strokeWidth={1.8} aria-hidden />
          </Link>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {/* Score + latest signal — inline stat pair, no boxes. Softer
            than the previous bordered cards, less visual noise. */}
        <div className="mb-7 flex items-center gap-6 text-[12.5px]">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
              Score
            </div>
            <div className="mt-0.5 font-display text-[18px] font-medium tabular-nums text-text-primary">
              {data.score}
            </div>
          </div>
          <div className="h-8 w-px bg-border-subtle" aria-hidden />
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
              Last signal
            </div>
            <div className="mt-0.5 text-[13px] text-text-primary">
              {data.latest_signal_at ? (
                <RelativeTime value={data.latest_signal_at} />
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </div>
          </div>
        </div>

        {/* Why now — accent-tinted card with check icon. Borrowed the
            "highlighted moment" pattern from the InfoTooltip surfaces
            so the most decision-useful line gets the most weight. */}
        {data.latest_signal_headline && (
          <section className="mb-7">
            <div className="rounded-xl border border-violet-400/20 bg-violet-400/[0.06] p-4">
              <div className="mb-2 flex items-center gap-1.5">
                <Sparkles
                  size={12}
                  strokeWidth={1.8}
                  className="text-violet-300"
                  aria-hidden
                />
                <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-violet-300">
                  Why now
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Check
                  size={13}
                  strokeWidth={2.2}
                  className="mt-0.5 shrink-0 text-violet-300/80"
                  aria-hidden
                />
                <p className="text-[13.5px] leading-relaxed text-text-primary">
                  {scrubBackendNames(data.latest_signal_headline)}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Credential exposure — stealer-log / dark-web. High-priority Risk
            surface placed right under Why-now. Renders only when there's any
            exposure; counts only, credentials never shown. */}
        <CredentialExposurePanel ce={data.credential_exposure} />

        {/* Signal chips */}
        {data.signal_chips.length > 0 && (
          <section className="mb-6">
            <SectionHeader
              title="Signals"
              subtitle={
                data.signal_more > 0
                  ? `Top ${data.signal_chips.length} + ${data.signal_more} more`
                  : undefined
              }
            />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.signal_chips.map((chip) => (
                <span
                  key={chip.category}
                  className="rounded-full border border-border-default bg-bg-elevated/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-text-secondary"
                >
                  {chip.label}
                  {typeof chip.count === "number" && chip.count > 0 && (
                    <span className="ml-1 text-text-muted">{chip.count}</span>
                  )}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Social signals */}
        {data.social_signals.length > 0 && (
          <section className="mb-6">
            <SectionHeader
              title="Social signals"
              subtitle={`${data.social_signals.length} in the last 30 days`}
            />
            <ul className="mt-3 flex flex-col gap-2.5">
              {data.social_signals.slice(0, 5).map((s, i) => {
                const label = SOCIAL_CHIP_LABELS[s.signal_type] ?? "Mention";
                const tone =
                  SOCIAL_TYPE_TONE[s.signal_type] ??
                  "border-border-default bg-bg-elevated text-text-secondary";
                const body = s.summary || s.excerpt;
                return (
                  <li
                    key={`${s.signal_type}-${i}-${s.detected_at}`}
                    className="rounded-lg border border-border-subtle bg-bg-elevated/30 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em]",
                          tone,
                        )}
                      >
                        {label}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">
                        {s.channel}
                      </span>
                      <span className="ml-auto text-[10.5px] text-text-muted">
                        <RelativeTime value={s.detected_at} />
                      </span>
                    </div>
                    {body && (
                      <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-snug text-text-secondary">
                        {body}
                      </p>
                    )}
                    {s.url && (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-accent"
                      >
                        Open source
                        <ExternalLink size={9} aria-hidden />
                      </a>
                    )}
                  </li>
                );
              })}
              {data.social_signals.length > 5 && (
                <li className="text-center text-[11.5px] text-text-muted">
                  {data.social_signals.length - 5} more on the full account page
                </li>
              )}
            </ul>
          </section>
        )}

        {/* People — Apollo-matched contacts at this account. Lazy
            loaded when the drawer opens; same apollo-people edge
            function as the standalone People drawer. */}
        <section className="mb-6">
          <SectionHeader
            title="People"
            subtitle={
              peopleData && peopleData.total > 0
                ? `${peopleData.total} ${peopleData.total === 1 ? "person" : "people"} matching your ICP titles`
                : titles.length > 0
                  ? "Matching your ICP titles"
                  : "All roles · ICP titles not configured"
            }
          />
          {peopleLoading && (
            <div className="mt-3 flex items-center gap-2 text-[12.5px] text-text-muted">
              <Loader2 size={12} className="animate-spin" aria-hidden />
              Finding people at this account…
            </div>
          )}
          {peopleError && (
            <div className="mt-3 text-[12.5px] text-rose-300/80" role="alert">
              Couldn&apos;t load people.
            </div>
          )}
          {!peopleLoading && !peopleError && people.length === 0 && (
            <div className="mt-3 text-[12.5px] text-text-muted">
              No people found at this domain
              {titles.length > 0 ? " matching your target titles." : "."}
            </div>
          )}
          {people.length > 0 && (
            <>
              <ul className="mt-3 flex flex-col gap-2">
                {people
                  .filter(
                    (p) => !(p.apollo_id && dismissedContacts?.has(p.apollo_id)),
                  )
                  .slice(0, 6)
                  .map((p) => (
                    <DrawerPersonCard
                      key={p.apollo_id ?? `${p.first_name}-${p.last_name_obfuscated}`}
                      p={p}
                      domain={data.domain}
                      companyId={data.company_id}
                      leadId={p.apollo_id ? leadIdByApollo?.[p.apollo_id] : undefined}
                    />
                  ))}
              </ul>
              {peopleData && peopleData.total > 6 && (
                <p className="mt-2 text-[11px] text-text-muted">
                  {peopleData.total - 6} more on the full account page
                </p>
              )}
            </>
          )}
        </section>

        {/* Quick facts — icon-led rows in a soft surface card. Cleaner
            than the bordered dl + label/value pattern; reads at a
            glance with the icon doing the disambiguation. */}
        <section className="mb-7">
          <SectionHeader title="At a glance" />
          <dl className="mt-3 rounded-xl border border-border-subtle bg-bg-elevated/30 px-4 py-3.5">
            <Fact
              Icon={MapPin}
              label="Location"
              value={[data.country].filter(Boolean).join("") || null}
            />
            <Fact
              Icon={Users}
              label="Size"
              value={data.size_band}
            />
            <Fact
              Icon={Building2}
              label="Revenue"
              value={data.revenue}
            />
            <Fact
              Icon={Sparkles}
              label="Potential"
              value={data.potential}
            />
            <Fact
              Icon={Calendar}
              label="Watching since"
              valueNode={
                data.watching_since ? (
                  <RelativeTime value={data.watching_since} />
                ) : null
              }
            />
            <Fact
              Icon={Calendar}
              label="Last enriched"
              valueNode={
                data.last_enriched_at ? (
                  <RelativeTime value={data.last_enriched_at} />
                ) : null
              }
              last
            />
          </dl>
        </section>

        {/* Monitoring — visible control over the weekly scan + the
            credit it spends. No invisible cadence. */}
        <MonitoringControl data={data} />

        {/* Stack */}
        {data.stack.length > 0 && (
          <section className="mb-2">
            <SectionHeader title="Tech stack" />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.stack.slice(0, 8).map((s) => (
                <span
                  key={s}
                  className="rounded-md border border-border-subtle bg-bg-elevated/40 px-2 py-0.5 text-[11px] text-text-secondary"
                >
                  {s}
                </span>
              ))}
              {data.stack.length > 8 && (
                <span className="text-[11px] text-text-muted">
                  +{data.stack.length - 8}
                </span>
              )}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

// Compact person card for the account drawer. Single-column friendly
// (the drawer is narrower than the dedicated People drawer); shows
// just the essentials so 6 rows fit without scrolling drama. Unlock
// (reveal email/phone + create a lead) works inline here too, mirroring the
// full account page — within plan caps for Solo, 1 credit otherwise.
function DrawerPersonCard({
  p,
  domain,
  companyId,
  leadId,
}: {
  p: PersonRow;
  domain: string;
  companyId: string | null;
  leadId?: string;
}) {
  const unlock = useUnlockContact();
  const dismiss = useDismissContact();
  const queryClient = useQueryClient();
  const { features } = useOrg();
  const isSolo = !!features.solo_plan;
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const router = useRouter();
  const lastName = p.unlocked ? p.last_name : p.last_name_obfuscated || "•••";
  const fullName = [p.first_name, lastName].filter(Boolean).join(" ");
  const location = [p.city, p.country].filter(Boolean).join(", ");
  // An unlocked contact's whole card clicks through to their page. If a lead
  // already exists we link straight to it; if it doesn't yet (e.g. a contact
  // surfaced/cached without a formal unlock), clicking materializes the lead
  // then opens it. Stretched-link pattern: a transparent absolute overlay
  // covers the card; the LinkedIn icon is raised above it (no nested anchors).
  const canMaterialize = !!companyId && !!p.apollo_id;
  const clickable = p.unlocked && (!!leadId || canMaterialize);

  async function openContact() {
    if (leadId) {
      router.push(`/dashboard/leads/${leadId}`);
      return;
    }
    if (!canMaterialize) return;
    setUnlockError(null);
    setOpening(true);
    try {
      const res = await unlock.mutateAsync({
        companyId: companyId as string,
        apolloId: p.apollo_id as string,
        firstName: p.first_name,
        lastName: p.last_name || undefined,
        name:
          [p.first_name, p.last_name].filter(Boolean).join(" ") || p.first_name,
        title: p.title || undefined,
        linkedinUrl: p.linkedin_url || undefined,
      });
      queryClient.invalidateQueries({
        queryKey: ["apollo_people_account_drawer"],
      });
      queryClient.invalidateQueries({ queryKey: ["drawer_lead_ids"] });
      if (res?.lead_id) router.push(`/dashboard/leads/${res.lead_id}`);
      else setOpening(false);
    } catch (e) {
      setUnlockError(e instanceof Error ? e.message : "Couldn't open contact");
      setOpening(false);
    }
  }

  return (
    <li
      className={cn(
        "relative rounded-lg border border-border-subtle bg-bg-elevated/30 px-3 py-2.5 transition-colors",
        clickable &&
          "hover:border-accent/50 hover:bg-accent/[0.05] hover:shadow-[0_0_0_1px_rgba(16,185,129,0.18),0_8px_22px_-12px_rgba(16,185,129,0.35)]",
      )}
    >
      {clickable &&
        (leadId ? (
          <Link
            href={`/dashboard/leads/${leadId}`}
            className="absolute inset-0 z-[1] rounded-lg"
            aria-label={`Open ${fullName || "contact"}`}
          />
        ) : (
          <button
            type="button"
            onClick={openContact}
            disabled={opening}
            className="absolute inset-0 z-[1] rounded-lg disabled:cursor-wait"
            aria-label={`Open ${fullName || "contact"}`}
          />
        ))}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium text-text-primary">
              {fullName || "(unknown)"}
            </span>
            {!p.unlocked && (
              <Lock
                size={10}
                className="shrink-0 text-text-muted"
                aria-label="Obfuscated"
              />
            )}
          </div>
          {p.title && (
            <div className="mt-0.5 truncate text-[11.5px] text-text-secondary">
              {p.title}
            </div>
          )}
          {p.relevance_reason && (
            <div className="mt-1 flex items-start gap-1 text-[10.5px] leading-snug text-accent">
              <Sparkles size={10} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden />
              <span className="line-clamp-2">{p.relevance_reason}</span>
            </div>
          )}
          {location && (
            <div className="mt-0.5 text-[10.5px] text-text-muted">
              {location}
            </div>
          )}
        </div>
        <div className="relative z-[2] flex shrink-0 flex-col items-end gap-1">
          {p.linkedin_url && (
            <a
              href={p.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded p-1 text-text-muted transition hover:bg-bg-elevated hover:text-text-primary"
              aria-label={`Open ${fullName}'s LinkedIn`}
            >
              <ExternalLink size={11} />
            </a>
          )}
          {p.apollo_id && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dismiss.mutate({
                  apolloId: p.apollo_id!,
                  name: fullName,
                  title: p.title,
                  domain,
                  surface: "account_drawer",
                });
              }}
              className="text-[10px] leading-none text-text-muted transition-colors hover:text-red-400"
              title="Mark not relevant. Vera learns from this."
            >
              Not relevant
            </button>
          )}
        </div>
      </div>
      {(p.has_email || p.has_phone) && (
        <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-text-muted">
          {p.has_email && (
            <span className="inline-flex items-center gap-1">
              <Mail size={9} aria-hidden />
              {p.unlocked && p.email ? p.email : "email"}
            </span>
          )}
          {p.has_phone && !p.unlocked && (
            <span className="inline-flex items-center gap-1">
              <Phone size={9} aria-hidden />
              phone
            </span>
          )}
        </div>
      )}
      {!p.unlocked && p.apollo_id && companyId && (
        <div className="mt-2">
          <SlideToConfirm
            text={isSolo ? "Unlock contact" : "Unlock · 1 credit"}
            successText="Unlocked"
            width={176}
            height={30}
            disabled={unlock.isPending}
            onConfirm={async () => {
              setUnlockError(null);
              try {
                // Person hints let the engine match + append the contact when
                // its apollo_id isn't cached in key_contacts yet (live search).
                await unlock.mutateAsync({
                  companyId,
                  apolloId: p.apollo_id!,
                  firstName: p.first_name,
                  lastName: p.last_name || undefined,
                  name:
                    [p.first_name, p.last_name].filter(Boolean).join(" ") ||
                    p.first_name,
                  title: p.title || undefined,
                  linkedinUrl: p.linkedin_url || undefined,
                });
                // Refresh the drawer's people list so this row flips to its
                // unlocked state (revealed email) without a reopen, and the
                // lead-id map so the card becomes clickable to the new lead.
                queryClient.invalidateQueries({
                  queryKey: ["apollo_people_account_drawer"],
                });
                queryClient.invalidateQueries({ queryKey: ["drawer_lead_ids"] });
              } catch (e) {
                setUnlockError(
                  e instanceof Error ? e.message : "Unlock failed",
                );
              }
            }}
          />
          {unlockError && (
            <p className="mt-1 text-[10.5px] text-rose-300/80">{unlockError}</p>
          )}
        </div>
      )}
    </li>
  );
}

function nextScanLabel(iso: string | null): string {
  if (!iso) return "next scan pending";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "due now";
  const days = Math.round(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return "later today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

function MonitoringControl({ data }: { data: AccountRowData }) {
  const setMonitoring = useSetMonitoring();
  const { features } = useOrg();
  const isSolo = !!features.solo_plan; // caps-based: never mention credits
  const active = data.monitoring_active;
  return (
    <section className="mb-5">
      <SectionHeader title="Monitoring" />
      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-bg-elevated/30 px-3.5 py-3">
        <div className="flex items-start gap-2.5">
          <Radar
            size={15}
            strokeWidth={1.7}
            className={cn("mt-0.5", active ? "text-accent" : "text-text-muted")}
            aria-hidden
          />
          <div className="text-[12.5px] leading-snug">
            {active ? (
              <>
                <span className="text-text-primary">Scanning weekly</span>
                {!isSolo && (
                  <span className="text-text-muted"> · ~1 credit/pass</span>
                )}
                <div className="text-[11px] text-text-muted">
                  Next scan {nextScanLabel(data.next_monitor_at)}
                </div>
              </>
            ) : (
              <>
                <span className="text-text-primary">Monitoring paused</span>
                <div className="text-[11px] text-text-muted">
                  {isSolo ? "No scans until resumed" : "No scans or credits until resumed"}
                </div>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          disabled={setMonitoring.isPending}
          onClick={() =>
            setMonitoring.mutate({
              watchlistId: data.watchlist_id,
              active: !active,
            })
          }
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors disabled:opacity-60",
            active
              ? "border-border-default text-text-secondary hover:border-amber-400/40 hover:text-amber-300"
              : "border-accent/30 bg-accent/10 text-accent hover:border-accent/50",
          )}
        >
          {active ? (
            <>
              <Pause size={11} strokeWidth={2} /> Pause
            </>
          ) : (
            <>
              <Play size={11} strokeWidth={2} /> Resume
            </>
          )}
        </button>
      </div>
    </section>
  );
}

function Fact({
  Icon,
  label,
  value,
  valueNode,
  last,
}: {
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  value?: string | null;
  valueNode?: React.ReactNode;
  /** Drops the bottom border on the final row. */
  last?: boolean;
}) {
  const empty = !value && !valueNode;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 py-2",
        !last && "border-b border-border-subtle/40",
      )}
    >
      <dt className="flex items-center gap-2 text-[12px] text-text-muted">
        <Icon
          size={12}
          strokeWidth={1.7}
          className="text-text-muted"
        />
        {label}
      </dt>
      <dd
        className={cn(
          "truncate text-[12.5px]",
          empty ? "text-text-muted" : "text-text-primary",
        )}
      >
        {empty ? "—" : (valueNode ?? value)}
      </dd>
    </div>
  );
}

// Company logo helper — DuckDuckGo's icon API fetched by domain.
// Falls back to a first-letter mark when the icon 404s or the org
// is too new to have one indexed.
function CompanyLogo({ domain, name }: { domain: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const initial = (name || domain).trim().charAt(0).toUpperCase() || "?";
  if (failed) {
    return (
      <div className="grid h-14 w-14 place-items-center rounded-full border border-border-subtle bg-bg-elevated font-display text-[20px] font-medium text-text-secondary">
        {initial}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl(domain, 128)}
      alt={`${name} logo`}
      width={56}
      height={56}
      onError={() => setFailed(true)}
      className="h-14 w-14 rounded-full border border-border-subtle bg-white object-contain p-1.5"
    />
  );
}
