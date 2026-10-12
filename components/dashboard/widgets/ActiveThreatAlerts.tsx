"use client";

import { motion } from "framer-motion";
import {
  ShieldAlert,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import {
  Card,
  EmptyState,
  Pill,
  RelativeTime,
  SectionHeader,
  Shimmer,
} from "@/components/dashboard/primitives";
import { useThreatAlerts } from "@/lib/dashboard/queries";

function urgencyPill(u: string | null) {
  if (u === "high") return <Pill variant="danger">High</Pill>;
  if (u === "medium") return <Pill variant="warning">Medium</Pill>;
  return <Pill variant="muted">{u ?? "low"}</Pill>;
}

export function ActiveThreatAlerts({ limit = 3 }: { limit?: number }) {
  const { data, isLoading } = useThreatAlerts();
  const open = (data ?? [])
    .filter((a) => a.status !== "dismissed")
    .slice(0, limit);

  return (
    <Card delay={0.3} className="p-6 md:p-7">
      <SectionHeader
        title="Open threat alerts"
        subtitle="ICP-relevant intel · ready to action"
        right={
          <Pill variant="outline">
            <ShieldAlert size={11} strokeWidth={1.7} />
            {(data ?? []).filter((a) => a.status === "new").length} new
          </Pill>
        }
      />

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Shimmer key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : open.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle size={16} strokeWidth={1.6} />}
          title="No open alerts"
          body="When intel matches your ICP, alerts appear here with a sales angle."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {open.map((a, i) => {
            const intel = a.threat_intel;
            return (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.35 + i * 0.06 }}
                className="rounded-xl border border-border-subtle bg-bg-elevated/40 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {urgencyPill(a.urgency)}
                      <RelativeTime value={a.detected_at} />
                    </div>
                    <h3 className="mt-2 line-clamp-2 font-display text-[13.5px] font-medium tracking-tight text-text-primary">
                      {intel?.title ?? a.relevance_reason}
                    </h3>
                    {a.sales_angle && (
                      <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-text-secondary">
                        {a.sales_angle}
                      </p>
                    )}
                  </div>
                  {intel?.url && (
                    <a
                      href={intel.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border-default text-text-muted transition-colors hover:border-border-strong hover:text-text-primary"
                      aria-label="Open source"
                    >
                      <ExternalLink size={12} strokeWidth={1.7} />
                    </a>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
