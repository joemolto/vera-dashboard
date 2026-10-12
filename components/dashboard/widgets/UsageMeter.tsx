"use client";

import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { useUsage } from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";

export function UsageMeter({
  variant = "compact",
}: {
  variant?: "compact" | "card";
}) {
  const { data: usage, isLoading } = useUsage();

  if (isLoading || !usage) return null;

  const used = usage.enrichments_used;
  const limit = usage.enrichments_limit;
  const remaining = usage.remaining;
  const pct = Math.min(100, Math.max(0, (used / Math.max(1, limit)) * 100));
  const tone =
    pct >= 100
      ? "danger"
      : pct >= 80
        ? "warning"
        : "ok";

  const barColor =
    tone === "danger"
      ? "bg-red-400"
      : tone === "warning"
        ? "bg-amber-400"
        : "bg-accent";
  const labelColor =
    tone === "danger"
      ? "text-red-400"
      : tone === "warning"
        ? "text-amber-400"
        : "text-text-secondary";

  const resets = new Date(usage.resets_on).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
  });

  if (variant === "card") {
    return (
      <div className="rounded-2xl border border-border-default bg-bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-muted">
            Enrichments · {usage.month}
          </div>
          <span className={cn("font-mono text-[10px] uppercase tracking-[0.18em]", labelColor)}>
            {usage.tier}
          </span>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-display text-[1.5rem] font-medium tracking-tight text-text-primary">
            {used}
          </span>
          <span className="font-mono text-[12px] text-text-muted">/ {limit}</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-elevated">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
            className={cn("h-full rounded-full", barColor)}
          />
        </div>
        <div className="mt-2 text-[12px] text-text-muted">
          {remaining > 0
            ? `${remaining} remaining · resets ${resets}`
            : `Limit hit · resets ${resets}`}
        </div>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-3 rounded-full border border-border-subtle bg-bg-card/60 px-3.5 py-1.5">
      <Zap size={11} strokeWidth={1.7} className={cn("shrink-0", labelColor)} />
      <div className="flex items-baseline gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em]">
        <span className={labelColor}>{used}</span>
        <span className="text-text-muted">/ {limit}</span>
        <span className="text-text-muted">used</span>
      </div>
      <div className="h-1 w-20 overflow-hidden rounded-full bg-bg-elevated">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
          className={cn("h-full rounded-full", barColor)}
        />
      </div>
    </div>
  );
}
