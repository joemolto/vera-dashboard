"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import {
  Card,
  EmptyState,
  SectionHeader,
  Shimmer,
} from "@/components/dashboard/primitives";
import { useSignals } from "@/lib/dashboard/queries";
import { Radar } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  hiring_sales_bd: "Hiring · sales & BD",
  new_leadership: "New leadership",
  new_partnership: "New partnership",
  product_launch: "Product launch",
  recent_acquisition: "Recent acquisition",
  funding_announced: "Funding announced",
  tech_stack_change: "Tech stack change",
  regulatory: "Regulatory",
};

function humanise(t: string) {
  return TYPE_LABELS[t] ?? t.replace(/_/g, " ");
}

export function SignalsBreakdown() {
  const { data, isLoading } = useSignals();

  const rows = useMemo(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    for (const s of data) counts.set(s.signal_type, (counts.get(s.signal_type) ?? 0) + 1);
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((acc, [, n]) => acc + n, 0) || 1;
    return entries.map(([type, n]) => ({
      type,
      n,
      pct: n / total,
    }));
  }, [data]);

  return (
    <Card delay={0.2} className="p-6 md:p-7">
      <SectionHeader
        title="Signals breakdown"
        subtitle="What Vera flagged across your watchlist"
      />

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Shimmer key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Radar size={16} strokeWidth={1.6} />}
          title="No signals yet"
          body="When Vera detects hiring, funding, or stack changes against your ICP, they show up here."
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((r, i) => (
            <motion.div
              key={r.type}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.25 + i * 0.05 }}
              className="group"
            >
              <div className="mb-1 flex items-center justify-between text-[12.5px]">
                <span className="text-text-secondary">{humanise(r.type)}</span>
                <span className="font-mono text-[11px] text-text-muted">
                  {r.n}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-bg-elevated">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${r.pct * 100}%` }}
                  transition={{
                    duration: 0.7,
                    delay: 0.3 + i * 0.05,
                    ease: [0.32, 0.72, 0, 1],
                  }}
                  className="h-full rounded-full bg-accent/70 group-hover:bg-accent"
                />
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </Card>
  );
}
