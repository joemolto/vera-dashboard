"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  ExternalLink,
  Mail,
  AlertCircle,
  Building2,
  Activity,
  Briefcase,
  Globe,
  RefreshCw,
  Loader2,
  Check,
  Trash2,
  X,
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
import { GtmBriefingCard } from "@/components/dashboard/widgets/GtmBriefing";
import { EmailDraftsCard } from "@/components/dashboard/widgets/EmailDrafts";
import { ThreatAlertsCard } from "@/components/dashboard/widgets/ThreatAlertsCard";
import { FeedbackButtons } from "@/components/dashboard/widgets/FeedbackButtons";
import { OutcomeButtons } from "@/components/dashboard/widgets/OutcomeButtons";
import { CompanyIntelAccordion } from "@/components/dashboard/widgets/CompanyIntelAccordion";
import { RevealPhoneButton } from "@/components/dashboard/widgets/RevealPhoneButton";
import { FindOthersAtCompanyButton } from "@/components/dashboard/widgets/FindOthersAtCompanyButton";
import { AddToGroupButton } from "@/components/dashboard/widgets/AddToGroupButton";
import { SendToButton } from "@/components/dashboard/widgets/SendToButton";
import { PersonAvatar } from "@/components/dashboard/PersonCell";
import { CompanyMark } from "@/components/dashboard/CompanyMark";
import { OtherContactsAtCompany } from "@/components/dashboard/widgets/OtherContactsAtCompany";
import { CompanyIntelligencePanel } from "@/components/dashboard/widgets/CompanyIntelligencePanel";
import { useOrg } from "@/components/dashboard/OrgContext";
import { claraApi } from "@/lib/dashboard/claraApi";
import { scrubBackendNames } from "@/lib/dashboard/labels";
import { useLead, useLeadSignals, useDeletePerson } from "@/lib/dashboard/queries";
import { SlideToConfirm } from "@/components/ui/SlideToConfirm";
import { statusPillVariant, dataStatusLabel } from "@/lib/dashboard/labels";
import { cn } from "@/lib/utils";
import type { Lead } from "@/lib/dashboard/types";

const SIGNAL_LABELS: Record<string, string> = {
  hiring_sales_bd: "Hiring · sales & BD",
  hiring_security: "Hiring · security",
  hiring_leadership: "Hiring · leadership",
  new_leadership: "New leadership",
  new_partnership: "New partnership",
  product_launch: "Product launch",
  recent_acquisition: "Recent acquisition",
  funding_announced: "Funding announced",
  recent_funding: "Funding",
  tech_stack_change: "Tech stack change",
  cve_in_stack: "CVE in stack",
  compliance_gap: "Compliance gap",
  breach_proximity: "Breach proximity",
  soc_expansion: "SOC expansion",
  security_leadership_hire: "Security leadership hire",
};

// Cover anything the map doesn't — turn `some_signal_name` into
// "Some signal name" so the user never sees raw snake_case.
function humaniseSignalType(raw: string): string {
  if (SIGNAL_LABELS[raw]) return SIGNAL_LABELS[raw];
  const words = raw.replace(/_/g, " ").trim();
  if (!words) return raw;
  // Preserve well-known acronyms in uppercase, sentence-case the rest.
  const ACRONYMS = new Set(["cve", "soc", "soc2", "iso", "nist", "kev", "icp", "mssp", "grc"]);
  return words
    .split(" ")
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(" ");
}

function fullName(l: Lead) {
  return [l.first_name, l.last_name].filter(Boolean).join(" ") || l.email;
}

// Remove a person (e.g. an accidental research). Soft-delete: disappears from
// the dashboard and frees the watched-people slot, but no unlock is refunded.
function RemovePersonControl({ leadId }: { leadId: string }) {
  const router = useRouter();
  const del = useDeletePerson();
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
            await del.mutateAsync(leadId);
            router.push("/dashboard/prospects");
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
      title="Remove this person from your dashboard. Won't refund an unlock."
      className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border-subtle px-2.5 py-1 text-[12px] text-text-muted transition-colors hover:border-red-400/40 hover:text-red-400"
    >
      <Trash2 size={12} strokeWidth={1.7} />
      Remove
    </button>
  );
}

function ratingPill(rating: string | null) {
  if (rating === "hot")
    return (
      <Pill variant="accent" className="!normal-case !tracking-normal">
        Hot prospect
      </Pill>
    );
  if (rating === "warm")
    return (
      <Pill variant="warning" className="!normal-case !tracking-normal">
        Warm prospect
      </Pill>
    );
  if (rating === "cold")
    return (
      <Pill variant="muted" className="!normal-case !tracking-normal">
        Cold
      </Pill>
    );
  return null;
}

function ScoreDial({ score, label }: { score: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-14 w-14">
        <svg viewBox="0 0 60 60" className="absolute inset-0" aria-hidden>
          <circle cx="30" cy="30" r={radius} fill="none" strokeWidth="3" className="stroke-border-subtle" />
          <circle
            cx="30"
            cy="30"
            r={radius}
            fill="none"
            strokeWidth="3"
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
            transform="rotate(-90 30 30)"
            className="stroke-accent"
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center font-display text-[14px] font-medium tracking-tight text-text-primary">
          {Math.round(clamped)}
        </div>
      </div>
      <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-text-muted">
        {label}
      </div>
    </div>
  );
}

type ReEnrichState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done" }
  // Soft, non-error notice (muted, never red, never raw JSON). Covers
  // "still working in the background" and "couldn't complete this time".
  | { kind: "notice"; message: string };

function ReEnrichButton({ leadId }: { leadId: string }) {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const [state, setState] = useState<ReEnrichState>({ kind: "idle" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Stop timers if the user navigates away mid-run.
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (resetRef.current) clearTimeout(resetRef.current);
    };
  }, []);

  function settle(next: ReEnrichState, autoResetMs: number) {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (next.kind === "done") {
      // Pull the fresh enrichment_data, score and new signals into the UI.
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
      qc.invalidateQueries({ queryKey: ["lead_signals", leadId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    }
    setState(next);
    resetRef.current = setTimeout(() => setState({ kind: "idle" }), autoResetMs);
  }

  async function onClick() {
    if (!leadId || !orgId || state.kind === "running") return;

    const sb = createSupabaseBrowserClient();

    // Baseline scored_at BEFORE triggering, so we can tell when *this*
    // run actually completes (scored_at advances) vs. a stale value.
    let baseline: string | null = null;
    try {
      const { data } = await sb
        .from("leads")
        .select("scored_at")
        .eq("id", leadId)
        .maybeSingle();
      baseline = data?.scored_at ?? null;
    } catch {
      /* non-fatal — poll still works without a baseline */
    }

    setState({ kind: "running" });

    // Fire the trigger. The engine's full_enrichment runs to completion
    // server-side even when the clara-api proxy is killed by Supabase's
    // edge-worker limit on long runs — so a proxy timeout / 502 /
    // WORKER_RESOURCE_LIMIT is NOT a failure. Swallow it deliberately
    // and let the lead-row poll be the single source of truth. This is
    // why the user never sees a raw proxy error any more.
    claraApi(
      "/enrichment/re-enrich",
      { method: "POST", body: JSON.stringify({ org_id: orgId, lead_id: leadId }) },
      240_000,
    ).catch(() => {
      /* expected on long enrichments — the poll below decides outcome */
    });

    // Poll the lead row until this run lands. Full pipeline is ~90–240s;
    // 6 min headroom before we downgrade to a soft "still running"
    // notice (never a red error).
    const startedAt = Date.now();
    const MAX_WAIT_MS = 6 * 60_000;
    pollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > MAX_WAIT_MS) {
        settle(
          {
            kind: "notice",
            message: "Still running in the background — it'll update here shortly.",
          },
          10_000,
        );
        return;
      }
      try {
        const { data } = await sb
          .from("leads")
          .select("enrichment_status, scored_at")
          .eq("id", leadId)
          .maybeSingle();
        if (!data) return;
        const advanced =
          data.scored_at != null && data.scored_at !== baseline;
        if (data.enrichment_status === "enriched" && advanced) {
          settle({ kind: "done" }, 4000);
        } else if (
          (data.enrichment_status === "failed" ||
            data.enrichment_status === "error") &&
          advanced
        ) {
          settle(
            {
              kind: "notice",
              message: "Couldn't refresh this time — try again shortly.",
            },
            8000,
          );
        }
      } catch {
        /* transient read blip — keep polling */
      }
    }, 5000);
  }

  const disabled = !leadId || !orgId || state.kind === "running";

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={
          state.kind === "running"
            ? "Re-running the full enrichment pipeline — this runs in the background and can take a couple of minutes"
            : "Re-enrich this lead with fresh signals"
        }
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-border-default bg-bg-base/50 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] transition-colors",
          disabled
            ? "cursor-wait text-text-muted"
            : "text-text-muted hover:border-border-strong hover:text-text-primary",
          state.kind === "done" && "border-accent/50 text-accent",
        )}
        aria-label="Re-enrich this lead"
      >
        {state.kind === "running" ? (
          <>
            <Loader2 size={11} strokeWidth={2} className="animate-spin" />
            Re-enriching
          </>
        ) : state.kind === "done" ? (
          <>
            <Check size={11} strokeWidth={2} />
            Re-enriched
          </>
        ) : (
          <>
            <RefreshCw size={11} strokeWidth={1.8} />
            Re-enrich
          </>
        )}
      </button>
      {state.kind === "running" && (
        <span className="max-w-[15rem] text-right text-[10px] leading-tight text-text-muted">
          Running in the background — this can take a couple of minutes. You can keep working.
        </span>
      )}
      {state.kind === "notice" && (
        <span className="max-w-[15rem] text-right text-[10px] leading-tight text-text-muted">
          {state.message}
        </span>
      )}
    </div>
  );
}

export default function ProspectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { features } = useOrg();
  const id = params?.id;
  const { data: lead, isLoading } = useLead(id);
  const { data: signals = [], isLoading: signalsLoading } = useLeadSignals(id);

  if (isLoading) {
    return (
      <PageShell>
        <div className="mx-auto max-w-5xl space-y-6">
          <Shimmer className="h-10 w-40" />
          <Shimmer className="h-72 w-full" />
          <Shimmer className="h-44 w-full" />
        </div>
      </PageShell>
    );
  }

  if (!lead) {
    return (
      <PageShell>
        <div className="mx-auto max-w-md py-20 text-center">
          <EmptyState
            icon={<AlertCircle size={16} strokeWidth={1.6} />}
            title="Prospect not found"
            body="The lead may have been archived or never existed."
          />
          <button
            type="button"
            onClick={() => router.push("/dashboard/prospects")}
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-border-default px-4 py-2 text-[13px] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
          >
            <ArrowLeft size={13} strokeWidth={1.7} />
            Back to prospects
          </button>
        </div>
      </PageShell>
    );
  }

  const enrichment = lead.enrichment_data ?? null;
  const total = Number(lead.total_score ?? 0);
  const icp = Number(lead.icp_score ?? 0);
  const sig = Number(lead.signal_score ?? 0);

  return (
    <PageShell>
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/prospects"
            className="inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-text-muted transition-colors hover:text-text-secondary"
          >
            <ArrowLeft size={12} strokeWidth={1.7} />
            Back to prospects
          </Link>
          <RemovePersonControl leadId={lead.id} />
        </div>

        <Card delay={0.05} className="mt-6 p-7 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-4">
                <PersonAvatar photo={lead.photo_url} name={fullName(lead)} size={56} />
                <div className="min-w-0">
                  <h1 className="truncate font-display text-[1.55rem] font-medium tracking-tight text-text-primary">
                    {fullName(lead)}
                  </h1>
                  <div className="mt-1 truncate text-[14px] text-text-secondary">
                    {lead.title ?? "—"}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[13px] text-text-muted">
                    <CompanyMark domain={lead.company_domain} name={lead.company_name} size={18} />
                    <span className="truncate">{lead.company_name ?? "—"}</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                {ratingPill(lead.lead_rating)}
                {lead.status && (
                  <Pill variant={statusPillVariant(lead.status)}>
                    {lead.status}
                  </Pill>
                )}
                {lead.data_status && lead.data_status !== "verified" && (
                  <Pill variant="warning" className="!normal-case !tracking-normal">
                    {dataStatusLabel(lead.data_status)}
                  </Pill>
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-4 text-[13px]">
                {lead.email && (
                  <a
                    href={`mailto:${lead.email}`}
                    className="inline-flex items-center gap-1.5 text-text-primary underline-offset-4 hover:underline"
                  >
                    <Mail size={13} strokeWidth={1.7} />
                    {lead.email}
                  </a>
                )}
                <RevealPhoneButton leadId={lead.id} existingPhone={lead.phone} />
                <FindOthersAtCompanyButton
                  leadId={lead.id}
                  hasCompanyDomain={Boolean(lead.company_domain)}
                />
                <AddToGroupButton leadId={lead.id} variant="button" />
                <SendToButton id={lead.id} variant="row" />
                {lead.linkedin_url && (
                  <a
                    href={lead.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-text-primary underline-offset-4 hover:underline"
                  >
                    LinkedIn <ExternalLink size={11} strokeWidth={1.7} />
                  </a>
                )}
                {lead.company_domain && (
                  <a
                    href={`https://${lead.company_domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-text-primary underline-offset-4 hover:underline"
                  >
                    {lead.company_domain}
                    <ExternalLink size={11} strokeWidth={1.7} />
                  </a>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-3">
              <div className="flex items-start gap-5">
                <ScoreDial score={total} label="Total" />
                {(icp > 0 || sig > 0) && (
                  <>
                    <ScoreDial score={icp} label="ICP" />
                    <ScoreDial score={sig} label="Signal" />
                  </>
                )}
              </div>
              <ReEnrichButton leadId={id ?? ""} />
            </div>
          </div>

          <OtherContactsAtCompany
            currentLeadId={lead.id}
            companyName={lead.company_name}
          />

          {lead.rating_reason && (
            <div className="mt-7 rounded-xl border border-border-subtle bg-bg-elevated/40 p-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">
                Why this rating
              </div>
              <p className="mt-2 text-[13.5px] leading-relaxed text-text-secondary">
                {scrubBackendNames(lead.rating_reason)}
              </p>
            </div>
          )}
        </Card>

        {enrichment?.gtm_briefing ? (
          <>
            <div className="mt-5">
              <GtmBriefingCard briefing={enrichment.gtm_briefing} />
              <div className="mt-3 flex flex-col-reverse items-stretch justify-between gap-3 px-2 md:flex-row md:items-end">
                <OutcomeButtons leadId={lead.id} />
                <FeedbackButtons
                  leadId={lead.id}
                  targetType="briefing"
                  messageAngle={
                    enrichment.gtm_briefing.recommended_play?.play_name
                  }
                />
              </div>
            </div>
            {/* Intelligence-only orgs (pilot 2026-06-11) get no
                drafted copy — Vera is intelligence, not outreach. The
                engine also stops generating drafts for these orgs;
                this gate additionally hides any pre-existing ones. */}
            {!features.intelligence_only &&
              enrichment.gtm_briefing.email_drafts && (
              <div className="mt-5">
                <EmailDraftsCard
                  drafts={enrichment.gtm_briefing.email_drafts}
                  recipient={{
                    name: fullName(lead),
                    email: lead.email,
                    company: lead.company_name,
                  }}
                />
              </div>
            )}
            {enrichment.website && (
              <div className="mt-5">
                <CompanyIntelligencePanel
                  intel={enrichment.website}
                  pagesScraped={enrichment.website._pages_scraped}
                />
              </div>
            )}
            {enrichment.threat_alerts && enrichment.threat_alerts.length > 0 && (
              <div className="mt-5">
                <ThreatAlertsCard alerts={enrichment.threat_alerts} />
              </div>
            )}
          </>
        ) : lead.best_approach_angle ? (
          <Card delay={0.1} className="mt-5 p-7 md:p-8">
            <div className="mb-4 flex items-center gap-2">
              <h2 className="font-display text-[1.05rem] font-medium tracking-tight text-text-primary">
                Best approach angle
              </h2>
            </div>
            <p className="whitespace-pre-line text-[14px] leading-relaxed text-text-primary">
              {scrubBackendNames(lead.best_approach_angle)}
            </p>
          </Card>
        ) : null}

        {enrichment && (
          <div className="mt-5">
            <CompanyIntelAccordion enrichment={enrichment} />
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          <Card delay={0.15} className="p-7">
            <div className="mb-4 flex items-center gap-2">
              <Building2 size={14} strokeWidth={1.7} className="text-text-muted" />
              <h2 className="font-display text-[1.05rem] font-medium tracking-tight text-text-primary">
                Company
              </h2>
            </div>
            <dl className="flex flex-col gap-3">
              <Row label="Name" value={lead.company_name} />
              <Row label="Industry" value={lead.company_industry} />
              <Row label="Size" value={lead.company_size} />
              <Row label="Location" value={lead.company_location} />
              <Row
                label="Domain"
                value={
                  lead.company_domain ? (
                    <a
                      href={`https://${lead.company_domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-text-primary underline-offset-4 hover:underline"
                    >
                      <Globe size={11} strokeWidth={1.7} />
                      {lead.company_domain}
                    </a>
                  ) : null
                }
              />
            </dl>
          </Card>

          <Card delay={0.2} className="p-7">
            <div className="mb-4 flex items-center gap-2">
              <Activity size={14} strokeWidth={1.7} className="text-text-muted" />
              <h2 className="font-display text-[1.05rem] font-medium tracking-tight text-text-primary">
                Pipeline
              </h2>
            </div>
            <dl className="flex flex-col gap-3">
              <Row
                label="Last enriched"
                value={<RelativeTime value={lead.enriched_at} />}
              />
              <Row
                label="Last scored"
                value={<RelativeTime value={lead.scored_at} />}
              />
              <Row
                label="Updated"
                value={<RelativeTime value={lead.updated_at} />}
              />
              <Row
                label="Created"
                value={<RelativeTime value={lead.created_at} />}
              />
            </dl>
          </Card>
        </div>

        <Card delay={0.25} className="mt-5 overflow-hidden">
          <div className="border-b border-border-subtle p-6 md:p-7">
            <SectionHeader
              title="Signals on this lead"
              subtitle="Triggers Vera detected for this prospect"
              right={
                <Pill variant="outline">
                  <Briefcase size={11} strokeWidth={1.7} />
                  {signals.length}
                </Pill>
              }
            />
          </div>
          {signalsLoading ? (
            <div className="flex flex-col gap-2 p-6">
              {[0, 1, 2].map((i) => (
                <Shimmer key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : signals.length === 0 ? (
            <EmptyState
              icon={<Briefcase size={16} strokeWidth={1.6} />}
              title="No signals yet"
              body="When Vera spots hiring, funding, or stack changes for this lead, they show up here."
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {signals.map((s, i) => (
                <motion.li
                  key={s.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.3 + i * 0.04 }}
                  className="flex items-center justify-between gap-4 px-6 py-3.5 md:px-7"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-[13.5px] tracking-tight text-text-primary">
                      {humaniseSignalType(s.signal_type)}
                    </span>
                  </div>
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.18em]">
                    <RelativeTime value={s.detected_at} />
                  </span>
                </motion.li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PageShell>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <dt className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-muted">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 truncate text-right text-text-primary">
        {value || <span className="text-text-muted">—</span>}
      </dd>
    </div>
  );
}
