"use client";

import { useState } from "react";
import { Check, X, MinusCircle, Loader2 } from "lucide-react";
import { useOrg } from "@/components/dashboard/OrgContext";
import { claraApi } from "@/lib/dashboard/claraApi";
import { cn } from "@/lib/utils";

type Outcome = "meeting_booked" | "no_reply" | "not_contacted";

interface OutcomeButtonsProps {
  leadId: string;
  className?: string;
}

const OPTIONS: {
  outcome: Outcome;
  label: string;
  icon: typeof Check;
  hoverClass: string;
}[] = [
  {
    outcome: "meeting_booked",
    label: "Booked a meeting",
    icon: Check,
    hoverClass:
      "hover:bg-emerald-500/10 hover:text-emerald-300 hover:border-emerald-500/30",
  },
  {
    outcome: "no_reply",
    label: "No reply",
    icon: X,
    hoverClass:
      "hover:bg-rose-500/10 hover:text-rose-300 hover:border-rose-500/30",
  },
  {
    outcome: "not_contacted",
    label: "Didn’t contact",
    icon: MinusCircle,
    hoverClass:
      "hover:bg-white/10 hover:text-white/80 hover:border-white/30",
  },
];

/**
 * Three-button outcome strip that lives under the briefing on the
 * prospect detail page. Click writes to lead_outcomes via the engine
 * (POST /leads/{id}/outcome). The row carries a snapshot of the
 * decision context (scored_signals, score_at_time, matched_play) so
 * the cross-client intelligence layer can learn which signal × play
 * combinations actually produced the outcome.
 */
export function OutcomeButtons({ leadId, className }: OutcomeButtonsProps) {
  const { orgId } = useOrg();
  const [submitted, setSubmitted] = useState<Outcome | null>(null);
  const [pending, setPending] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(outcome: Outcome) {
    if (pending || submitted || !orgId) return;
    setPending(outcome);
    setError(null);
    try {
      await claraApi(`/leads/${leadId}/outcome`, {
        method: "POST",
        body: JSON.stringify({ org_id: orgId, outcome }),
      });
      setSubmitted(outcome);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to record outcome",
      );
    } finally {
      setPending(null);
    }
  }

  if (submitted) {
    const opt = OPTIONS.find((o) => o.outcome === submitted);
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 text-[12.5px] text-emerald-300/80",
          className,
        )}
        role="status"
      >
        <Check size={14} aria-hidden />
        <span>
          Thanks — recorded as “{opt?.label.toLowerCase()}”. This helps
          Vera learn.
        </span>
      </div>
    );
  }

  return (
    <div className={cn("inline-flex flex-col items-start gap-1.5", className)}>
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
        Outcome
      </span>
      <div className="inline-flex flex-wrap items-center gap-1.5">
        {OPTIONS.map((opt) => {
          const Icon = pending === opt.outcome ? Loader2 : opt.icon;
          return (
            <button
              key={opt.outcome}
              type="button"
              onClick={() => submit(opt.outcome)}
              disabled={!!pending}
              aria-label={opt.label}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md",
                "border border-border-default bg-bg-elevated/40",
                "text-[12px] text-text-secondary transition",
                opt.hoverClass,
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              <Icon
                size={13}
                aria-hidden
                className={pending === opt.outcome ? "animate-spin" : ""}
              />
              {opt.label}
            </button>
          );
        })}
      </div>
      {error && (
        <span
          role="alert"
          className="text-[11.5px] text-rose-400/90"
        >
          {error}
        </span>
      )}
    </div>
  );
}
