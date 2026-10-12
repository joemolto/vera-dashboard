"use client";

/**
 * Profile score card — dossier hero (cyber lens v1, pilot).
 *
 * Three readings in one card:
 *   1. Composite Profile score (0-100) with 30-day delta — the headline
 *   2. Radar across the four cyber lenses (Risk / Posture / Maturity /
 *      Commercial) — shape tells the story faster than four numbers
 *   3. Per-axis bars with expandable evidence breakdown so reps can
 *      see exactly what produced each axis score (zero black box)
 *
 * No qualitative labels (no "Proactive" / "Mature"). The number + the
 * shape + the breakdown tells the story; we don't paste a Vera-invented
 * adjective on top.
 *
 * Reads from companies.profile_score (engine: account_profile_scorer.py).
 * Security team profile is shown inline under the Maturity axis when
 * present (it's the strongest single Maturity contributor).
 */

import { useState } from "react";
import { ChevronRight, TrendingDown, TrendingUp } from "lucide-react";

import { Card } from "@/components/dashboard/primitives";
import { cn } from "@/lib/utils";
import type { ProfileScoreRow } from "@/app/dashboard/accounts/[domain]/page";

type Axis = "risk" | "posture" | "maturity" | "commercial";

const AXIS_LABELS: Record<Axis, string> = {
  risk: "Risk",
  posture: "Posture",
  maturity: "Maturity",
  commercial: "Commercial",
};

// Bar list in lens-priority order — matches the Signals tab's section order
// so the rep reads the same axis sequence everywhere on the dossier.
const BAR_ORDER: Axis[] = ["risk", "posture", "maturity", "commercial"];

interface SecurityTeamProfile {
  counts_by_bucket: Record<string, number>;
  total: number;
  top_titles: string[];
  expected_band: [number, number];
  score: number;
  gap_buckets: string[];
  is_regulated_industry: boolean;
  refreshed_at: string;
}

const BUCKET_LABELS: Record<string, string> = {
  leadership: "Leadership",
  engineering: "Engineering",
  soc_ops: "SOC / Ops",
  grc: "GRC",
  iam: "IAM",
};

export function ProfileScoreCard({
  score,
  teamProfile,
  paragraph,
}: {
  score: ProfileScoreRow;
  teamProfile: SecurityTeamProfile | null;
  paragraph?: string | null;
}) {
  const { composite, delta_30d } = score;
  const compositeDelta = delta_30d?.composite ?? 0;

  return (
    <Card className="p-7 md:p-8">
      <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted mb-5">
        Profile
      </div>

      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[56px] leading-none font-semibold tabular-nums text-text-primary">
          {composite}
        </span>
        <span className="font-mono text-[14px] text-text-muted">/ 100</span>
        {compositeDelta !== 0 && (
          <span className="ml-1">
            <DeltaPill delta={compositeDelta} />
          </span>
        )}
      </div>

      <div className="mt-6 border-t border-border-subtle pt-5 flex flex-col gap-2.5">
        {BAR_ORDER.map((axis) => (
          <AxisRow
            key={axis}
            axis={axis}
            value={score[axis]}
            delta={delta_30d?.[axis] ?? 0}
            breakdown={score.axis_breakdown?.[axis] ?? []}
            teamProfile={axis === "maturity" ? teamProfile : null}
          />
        ))}
      </div>

      {paragraph && (
        <p className="mt-6 border-t border-border-subtle pt-5 text-[13.5px] leading-relaxed text-text-secondary">
          {paragraph}
        </p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Composite delta pill
// ---------------------------------------------------------------------------
function DeltaPill({ delta }: { delta: number }) {
  const up = delta > 0;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
        up
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-900/30 dark:text-emerald-300"
          : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/40 dark:bg-rose-950/30 dark:text-rose-300",
      )}
    >
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      <span className="font-mono tabular-nums">
        {up ? "+" : ""}{delta}
      </span>
      <span className="text-text-muted">30d</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-axis row with expandable evidence breakdown
// ---------------------------------------------------------------------------
function AxisRow({
  axis,
  value,
  delta,
  breakdown,
  teamProfile,
}: {
  axis: Axis;
  value: number;
  delta: number;
  breakdown: ProfileScoreRow["axis_breakdown"][Axis];
  teamProfile: SecurityTeamProfile | null;
}) {
  const [open, setOpen] = useState(false);
  const hasDetail = breakdown.length > 0 || teamProfile;
  return (
    <div>
      <button
        type="button"
        onClick={() => hasDetail && setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-3 py-2 text-left transition-colors",
          hasDetail ? "hover:text-text-primary cursor-pointer" : "cursor-default",
        )}
        disabled={!hasDetail}
      >
        <span className="w-24 shrink-0 text-[12.5px] text-text-secondary">
          {AXIS_LABELS[axis]}
        </span>
        <div className="flex-1 h-1.5 rounded-full bg-bg-elevated overflow-hidden">
          <div
            className={cn("h-full transition-all", axisFillClass(axis))}
            style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
          />
        </div>
        <span className="w-8 shrink-0 text-right font-mono text-[12.5px] tabular-nums text-text-primary">
          {value}
        </span>
        {/* Fixed-width delta + chevron slots so the numbers line up whether or
            not a row has a delta or expandable detail. */}
        <span
          className={cn(
            "w-10 shrink-0 text-right font-mono text-[10.5px] tabular-nums",
            delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-transparent",
          )}
        >
          {delta !== 0 ? `${delta > 0 ? "+" : ""}${delta}` : ""}
        </span>
        <span className="flex w-3.5 shrink-0 justify-end">
          {hasDetail && (
            <ChevronRight
              size={13}
              className={cn("text-text-muted transition-transform", open && "rotate-90")}
            />
          )}
        </span>
      </button>
      {open && hasDetail && (
        <div className="ml-24 mt-2 mb-3 flex flex-col gap-1.5 border-l border-border-subtle pl-4">
          {breakdown.length === 0 && !teamProfile && (
            <div className="text-[11.5px] text-text-muted py-1">
              No supporting evidence yet.
            </div>
          )}
          {breakdown.map((c, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3 text-[12px]">
              <span className="text-text-secondary truncate">{c.label}</span>
              <div className="flex items-baseline gap-2 shrink-0">
                {c.detail && (
                  <span className="text-[10.5px] text-text-muted">{c.detail}</span>
                )}
                <span className="font-mono tabular-nums text-text-primary">
                  +{c.points}
                </span>
              </div>
            </div>
          ))}
          {axis === "maturity" && teamProfile && (
            <SecurityTeamBlock teamProfile={teamProfile} />
          )}
        </div>
      )}
    </div>
  );
}

function axisFillClass(axis: Axis): string {
  switch (axis) {
    case "risk":       return "bg-rose-500/70";
    case "posture":    return "bg-sky-500/70";
    case "maturity":   return "bg-emerald-500/70";
    case "commercial": return "bg-amber-500/70";
  }
}

// ---------------------------------------------------------------------------
// Security team headcount — shown inline under Maturity when present.
// ---------------------------------------------------------------------------
function SecurityTeamBlock({ teamProfile }: { teamProfile: SecurityTeamProfile }) {
  const { counts_by_bucket, total, expected_band, gap_buckets } = teamProfile;
  const [lo, hi] = expected_band;
  return (
    <div className="mt-2 pt-2 border-t border-border-subtle/60 flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-[12px]">
        <span className="text-text-secondary">Security team</span>
        <span className="font-mono text-text-primary tabular-nums">
          {total} <span className="text-text-muted">people · expected {lo}–{hi}</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {Object.entries(counts_by_bucket).map(([bucket, n]) => {
          const label = BUCKET_LABELS[bucket] ?? bucket;
          const isGap = gap_buckets.includes(bucket);
          return (
            <span
              key={bucket}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px]",
                isGap
                  ? "border-amber-700/40 bg-amber-950/30 text-amber-300"
                  : n > 0
                    ? "border-border-subtle bg-bg-elevated/40 text-text-secondary"
                    : "border-border-subtle bg-bg-elevated/20 text-text-muted",
              )}
            >
              {label}
              <span className="font-mono tabular-nums">{n}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
