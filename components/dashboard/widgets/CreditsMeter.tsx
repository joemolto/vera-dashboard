"use client";

import { Zap } from "lucide-react";
import { useCreditsMeter } from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";

/** Sidebar credit-burn meter. Used / total this month + a thin progress bar.
 * Hidden when the org has no allowance set (fresh org pre-billing). */
export function CreditsMeter({ collapsed }: { collapsed: boolean }) {
  const { data, isLoading } = useCreditsMeter();
  if (isLoading || !data) return null;

  const total = data.included + data.purchased;
  if (total === 0) return null; // no allowance configured yet

  const pct = data.pct_used;
  const remaining = data.remaining;
  const lowBalance = remaining <= total * 0.1;

  // Collapsed sidebar: render a single 8px dot whose colour reflects burn.
  if (collapsed) {
    return (
      <div className="mx-auto my-3 grid place-items-center" title={`${data.used}/${total} credits this month`}>
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            lowBalance ? "bg-rose-400" : pct > 50 ? "bg-amber-400" : "bg-emerald-400/80",
          )}
        />
      </div>
    );
  }

  return (
    <div className="mx-3 mt-2 rounded-lg border border-border-subtle bg-bg-elevated/30 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
          <Zap size={10} strokeWidth={1.7} aria-hidden />
          Credits
        </div>
        <div className="font-mono text-[10.5px] text-text-secondary">
          <span className={lowBalance ? "text-rose-300" : "text-text-primary"}>
            {data.used.toLocaleString()}
          </span>
          <span className="text-text-muted"> / {total.toLocaleString()}</span>
        </div>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-text-muted/10">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            lowBalance
              ? "bg-rose-400"
              : pct > 50
                ? "bg-amber-400"
                : "bg-emerald-400/70",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 text-[10.5px] text-text-muted">
        {remaining.toLocaleString()} left this month
      </div>
    </div>
  );
}
