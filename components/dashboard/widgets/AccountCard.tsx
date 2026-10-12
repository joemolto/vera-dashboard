"use client";

import Link from "next/link";
import { ArrowUpRight, Building2 } from "lucide-react";
import { Card, Pill, RelativeTime } from "@/components/dashboard/primitives";
import { scrubBackendNames } from "@/lib/dashboard/labels";
import { cn } from "@/lib/utils";

export interface AccountCardData {
  domain: string;
  name: string;
  industry: string | null;
  country: string | null;
  employee_count: number | null;
  revenue_printed: string | null; // e.g. "$1.1B" — formatted upstream
  /** Top 3-4 stack chips, canonical names only. Order = caller's pick. */
  stack: string[];
  /** Freshest signal headline, or null if no recent activity. */
  latest_signal_headline: string | null;
  /** When the freshest signal was observed (ISO). */
  latest_signal_at: string | null;
  /** When the company was last enriched (ISO). Drives "stale" dot. */
  last_enriched_at: string | null;
}

function freshnessDot(latestSignalAt: string | null) {
  if (!latestSignalAt) {
    return { colour: "bg-text-muted/40", label: "No new signal" };
  }
  const age = Date.now() - new Date(latestSignalAt).getTime();
  const days = age / (1000 * 60 * 60 * 24);
  if (days < 7) return { colour: "bg-emerald-400", label: "Fresh" };
  if (days < 30) return { colour: "bg-amber-400", label: "Recent" };
  return { colour: "bg-text-muted/40", label: "Aging" };
}

export function AccountCard({
  data,
  delay = 0,
}: {
  data: AccountCardData;
  delay?: number;
}) {
  const dot = freshnessDot(data.latest_signal_at);
  const meta: string[] = [];
  if (data.industry) meta.push(data.industry);
  if (data.country) meta.push(data.country);
  if (data.employee_count) meta.push(`${data.employee_count.toLocaleString()} emp`);
  if (data.revenue_printed) meta.push(data.revenue_printed);

  return (
    <Card delay={delay} className="group relative overflow-hidden">
      <Link
        href={`/dashboard/accounts/${encodeURIComponent(data.domain)}`}
        className="block p-5"
        aria-label={`Open ${data.name}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={cn("h-2 w-2 shrink-0 rounded-full", dot.colour)}
                title={dot.label}
                aria-hidden
              />
              <h3 className="truncate font-display text-[15px] font-medium tracking-tight text-text-primary">
                {data.name}
              </h3>
            </div>
            {meta.length > 0 && (
              <p className="mt-1 text-[12px] text-text-muted">
                {meta.join(" · ")}
              </p>
            )}
          </div>
          <ArrowUpRight
            size={16}
            className="shrink-0 text-text-muted transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-text-primary"
            aria-hidden
          />
        </div>

        {data.latest_signal_headline && (
          <p className="mt-3 line-clamp-2 text-[13px] leading-snug text-text-secondary">
            {scrubBackendNames(data.latest_signal_headline)}
            {data.latest_signal_at && (
              <span className="ml-1.5 text-text-muted">
                · <RelativeTime value={data.latest_signal_at} />
              </span>
            )}
          </p>
        )}

        {data.stack.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {data.stack.slice(0, 4).map((s) => (
              <Pill key={s} variant="muted">
                {s}
              </Pill>
            ))}
          </div>
        )}
      </Link>
    </Card>
  );
}

export function AccountCardSkeleton() {
  return (
    <div
      className="rounded-2xl border border-border-default bg-bg-card p-5"
      aria-hidden
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-text-muted/30" />
            <div className="h-3 w-32 rounded bg-text-muted/15" />
          </div>
          <div className="mt-2 h-2.5 w-44 rounded bg-text-muted/10" />
        </div>
        <Building2 size={14} className="text-text-muted/40" />
      </div>
      <div className="mt-4 h-2.5 w-full rounded bg-text-muted/10" />
      <div className="mt-1.5 h-2.5 w-2/3 rounded bg-text-muted/10" />
    </div>
  );
}
