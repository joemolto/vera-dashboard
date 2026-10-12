"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { ArrowUpRight, Check, Loader2 } from "lucide-react";
import {
  Card,
  EmptyState,
  Pill,
  SectionHeader,
  Shimmer,
} from "@/components/dashboard/primitives";
import { useLeads, useMarkReachedOut } from "@/lib/dashboard/queries";
import { scrubBackendNames } from "@/lib/dashboard/labels";
import type { Lead } from "@/lib/dashboard/types";
import {
  primarySignalType,
  signalMeta,
  shortAgo,
} from "@/lib/dashboard/signalTaxonomy";
import { Flame } from "lucide-react";

const DAY = 24 * 60 * 60 * 1000;
const SHOW = 3;

function fullName(l: Lead) {
  return [l.first_name, l.last_name].filter(Boolean).join(" ") || l.email;
}

function num(v: string | number | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Freshest meaningful timestamp for ranking + the signal-card stamp. */
function freshTs(l: Lead): number {
  const c = [l.first_hot_at, l.scored_at, l.enriched_at, l.updated_at]
    .map((v) => (v ? new Date(v).getTime() : 0))
    .filter((n) => n > 0);
  return c.length ? Math.max(...c) : 0;
}

/** Pull funding stage off the merged business-intel block if present. */
function fundingPill(l: Lead): string | null {
  const bi = (l.enrichment_data as Record<string, unknown> | null)
    ?.business_intel as Record<string, unknown> | undefined;
  const stage =
    (bi?.latest_funding_stage as string | undefined) ??
    (bi?.funding_stage as string | undefined);
  if (!stage) return null;
  const when = bi?.latest_funding_date as string | undefined;
  return when ? `${stage} · ${when}` : String(stage);
}

export function ActOnToday() {
  const { data, isLoading } = useLeads();

  const top = useMemo<Lead[]>(() => {
    return (data ?? [])
      .filter(
        (l) =>
          (l.lead_rating === "hot" || l.lead_rating === "warm") &&
          // Reached-out leads drop out of the queue — the next hot
          // lead slides into the freed slot automatically.
          !l.outreach_at,
      )
      .sort((a, b) => {
        // Score, penalised by staleness — a fresh 85 beats a 2-week-old 90.
        const da = (Date.now() - freshTs(a)) / DAY;
        const db = (Date.now() - freshTs(b)) / DAY;
        return num(b.total_score) - db * 1.5 - (num(a.total_score) - da * 1.5);
      })
      .slice(0, SHOW);
  }, [data]);

  return (
    <Card delay={0.15} className="overflow-hidden">
      <div className="border-b border-border-subtle p-6 md:p-7">
        <SectionHeader
          title="Act on today"
          subtitle="Hot prospects with a fresh, time-sensitive hook"
          right={
            <Link
              href="/dashboard/prospects"
              className="inline-flex items-center gap-1.5 rounded-full border border-border-default px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
            >
              All prospects <ArrowUpRight size={11} strokeWidth={1.7} />
            </Link>
          }
        />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3 p-6 md:p-7">
          {[0, 1, 2].map((i) => (
            <Shimmer key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : top.length === 0 ? (
        <EmptyState
          icon={<Flame size={16} strokeWidth={1.6} />}
          title="Nothing to action yet"
          body="When Vera scores a fresh hot prospect with a time-sensitive hook, they'll appear here ready to draft."
        />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {top.map((l, i) => (
            <ProspectRow key={l.id} lead={l} index={i} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function ProspectRow({ lead, index }: { lead: Lead; index: number }) {
  const meta = signalMeta(primarySignalType(lead));
  const score = Math.round(num(lead.total_score));
  const stampTs =
    lead.first_hot_at ?? lead.scored_at ?? lead.enriched_at ?? lead.updated_at;
  const why = scrubBackendNames(
    lead.rating_reason ??
      lead.best_approach_angle ??
      "Scored hot — open the prospect for the full briefing.",
  );
  const funding = fundingPill(lead);

  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.2 + index * 0.05 }}
      className="grid grid-cols-[36px_1fr_auto] gap-4 p-6 md:px-7"
    >
      {/* Avatar */}
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bg-elevated font-display text-[12px] font-medium text-text-primary">
        {(fullName(lead)[0] ?? "?").toUpperCase()}
      </div>

      {/* Content */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-[14.5px] font-medium tracking-tight text-text-primary">
            {fullName(lead)}
          </span>
          <span className="truncate text-[12.5px] text-text-muted">
            {lead.title ?? "—"}
            {lead.company_name ? ` · ${lead.company_name}` : ""}
          </span>
          <Pill
            variant={lead.lead_rating === "hot" ? "accent" : "warning"}
            className="!normal-case !tracking-normal"
          >
            {lead.lead_rating === "hot" ? "Hot" : "Warm"}
          </Pill>
        </div>

        {/* Signal card — the critical new element */}
        <div className="mt-3 rounded-lg border-l-2 border-border-default bg-bg-elevated/40 py-2.5 pl-3 pr-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.18em] ${meta.color}`}
            >
              <meta.Icon size={11} strokeWidth={1.8} />
              {meta.label}
            </span>
            {stampTs && (
              <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-text-muted">
                {shortAgo(stampTs)}
              </span>
            )}
          </div>
          <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-text-secondary">
            {why}
          </p>
        </div>

        {/* Metadata pills */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {lead.company_size && (
            <Pill variant="muted">{lead.company_size} emp</Pill>
          )}
          {lead.company_location && (
            <Pill variant="muted">{lead.company_location}</Pill>
          )}
          {lead.company_industry && (
            <Pill variant="muted">{lead.company_industry}</Pill>
          )}
          {funding && <Pill variant="outline">{funding}</Pill>}
        </div>
      </div>

      {/* Score + CTAs */}
      <div className="flex shrink-0 flex-col items-end justify-between gap-3">
        <ScoreCircle score={score} />
        <div className="flex flex-col items-end gap-1.5">
          <Link
            href={`/dashboard/prospects/${lead.id}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-text-primary px-3.5 py-1.5 text-[12px] font-medium tracking-tight text-bg-base transition-opacity hover:opacity-90"
          >
            Draft
            <ArrowUpRight size={12} strokeWidth={2} />
          </Link>
          <ReachedOutButton leadId={lead.id} />
        </div>
      </div>
    </motion.li>
  );
}

function ReachedOutButton({ leadId }: { leadId: string }) {
  const markReachedOut = useMarkReachedOut();
  return (
    <button
      type="button"
      onClick={() => markReachedOut.mutate(leadId)}
      disabled={markReachedOut.isPending}
      className="inline-flex items-center gap-1.5 rounded-full border border-border-default px-3 py-1.5 text-[11.5px] text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary disabled:opacity-50"
    >
      {markReachedOut.isPending ? (
        <Loader2 size={11} strokeWidth={2} className="animate-spin" />
      ) : (
        <Check size={11} strokeWidth={2} />
      )}
      Reached out
    </button>
  );
}

function ScoreCircle({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const r = 18;
  const circ = 2 * Math.PI * r;
  const dash = (clamped / 100) * circ;
  return (
    <div className="relative h-11 w-11">
      <svg viewBox="0 0 44 44" className="absolute inset-0" aria-hidden>
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          strokeWidth="3"
          className="stroke-border-subtle"
        />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          strokeWidth="3"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 22 22)"
          className="stroke-accent"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center font-mono text-[11px] tracking-tight text-text-primary">
        {clamped}
      </div>
    </div>
  );
}
