"use client";

import Link from "next/link";
import { ArrowUpRight, Users } from "lucide-react";
import { motion } from "framer-motion";
import {
  Card,
  EmptyState,
  Pill,
  SectionHeader,
  Shimmer,
} from "@/components/dashboard/primitives";
import { useLeads } from "@/lib/dashboard/queries";
import type { Lead } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

function ratingPill(rating: string | null) {
  if (rating === "hot")
    return (
      <Pill variant="accent" className="!normal-case !tracking-normal">
        Hot
      </Pill>
    );
  if (rating === "warm")
    return (
      <Pill variant="warning" className="!normal-case !tracking-normal">
        Warm
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

function fullName(l: Lead) {
  return [l.first_name, l.last_name].filter(Boolean).join(" ") || l.email;
}

export function TopLeads() {
  const { data, isLoading } = useLeads();
  const top = (data ?? []).slice(0, 6);

  return (
    <Card delay={0.25} className="overflow-hidden">
      <div className="border-b border-border-subtle p-6 md:p-7">
        <SectionHeader
          title="Top leads"
          subtitle="Highest-scoring qualified prospects right now"
          right={
            <Link
              href="/dashboard/leads"
              className="inline-flex items-center gap-1.5 rounded-full border border-border-default px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
            >
              All leads <ArrowUpRight size={11} strokeWidth={1.7} />
            </Link>
          }
        />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2 p-6 md:p-7">
          {[0, 1, 2, 3, 4].map((i) => (
            <Shimmer key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : top.length === 0 ? (
        <EmptyState
          icon={<Users size={16} strokeWidth={1.6} />}
          title="No qualified leads yet"
          body="Once Vera scores prospects, the top of the pipeline lands here."
        />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {top.map((l, i) => {
            const score = Number(l.total_score ?? 0);
            return (
              <motion.li
                key={l.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.3 + i * 0.04 }}
              >
                <Link
                  href={`/dashboard/prospects/${l.id}`}
                  className="group flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-bg-elevated/40 md:px-7"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bg-elevated font-display text-[12px] font-medium text-text-primary">
                      {(fullName(l)[0] ?? "?").toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 truncate">
                        <span className="truncate font-display text-[14px] font-medium tracking-tight text-text-primary">
                          {fullName(l)}
                        </span>
                        {ratingPill(l.lead_rating)}
                      </div>
                      <div className="mt-0.5 truncate text-[12.5px] text-text-muted">
                        {l.title ?? "—"}
                        {l.company_name ? ` · ${l.company_name}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <ScoreDial score={score} />
                    <ArrowUpRight
                      size={14}
                      strokeWidth={1.7}
                      className={cn(
                        "shrink-0 text-text-muted transition-colors",
                        "group-hover:text-text-primary",
                      )}
                    />
                  </div>
                </Link>
              </motion.li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ScoreDial({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;
  return (
    <div className="relative h-9 w-9">
      <svg
        viewBox="0 0 36 36"
        className="absolute inset-0"
        aria-hidden
      >
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          strokeWidth="2.5"
          className="stroke-border-subtle"
        />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          strokeWidth="2.5"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
          transform="rotate(-90 18 18)"
          className="stroke-accent"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center font-mono text-[10px] tracking-tight text-text-primary">
        {Math.round(clamped)}
      </div>
    </div>
  );
}
