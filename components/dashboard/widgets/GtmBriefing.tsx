"use client";

import { motion } from "framer-motion";
import { CircleCheck, CircleHelp, Sparkles } from "lucide-react";
import { Pill } from "@/components/dashboard/primitives";
import { cn } from "@/lib/utils";
import { scrubBackendNames } from "@/lib/dashboard/labels";
import type { GtmBriefing } from "@/lib/dashboard/types";

const SIGNAL_LABELS: Record<string, string> = {
  hiring: "Hiring",
  hiring_sales_bd: "Hiring · sales & BD",
  hiring_security: "Hiring · security",
  hiring_leadership: "Hiring · leadership",
  new_leadership: "New leadership",
  growing_tech_stack: "Tech stack growing",
  product_launch_or_partnership: "Product / partnership",
  recent_acquisition: "Recent acquisition",
  recent_funding: "Recent funding",
  regulated_industry: "Regulated industry",
};

function readinessVariant(r: string | undefined) {
  if (r === "high") return "accent" as const;
  if (r === "medium") return "warning" as const;
  return "muted" as const;
}

function confidenceLabel(c: string | undefined) {
  if (!c) return "—";
  return c.charAt(0).toUpperCase() + c.slice(1);
}

export function GtmBriefingCard({ briefing }: { briefing: GtmBriefing }) {
  const knownSignals = (briefing.what_we_know ?? []).slice(0, 6);
  const detected = briefing.what_we_detected ?? [];
  const signalsFlags = briefing.signals_detected ?? {};
  const triggered = Object.entries(signalsFlags)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const gaps = briefing.gaps ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
      className="overflow-hidden rounded-2xl border border-border-default bg-bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border-subtle px-7 py-4">
        <Sparkles size={14} strokeWidth={1.7} className="text-accent" />
        <h2 className="font-display text-[1.05rem] font-medium tracking-tight text-text-primary">
          GTM intelligence briefing
        </h2>
        <div className="ml-auto flex items-center gap-2">
          <Pill variant={readinessVariant(briefing.buying_readiness)}>
            Readiness · {briefing.buying_readiness ?? "—"}
          </Pill>
          <Pill variant="outline">
            Confidence · {confidenceLabel(briefing.confidence_level)}
          </Pill>
        </div>
      </div>

      <div className="px-7 py-6">
        {briefing.intelligence_summary && (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">
              Intelligence summary
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-text-primary">
              {scrubBackendNames(briefing.intelligence_summary)}
            </p>
          </div>
        )}

        {triggered.length > 0 && (
          <div className="mt-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">
              Signals detected
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {triggered.map((k) => (
                <Pill key={k} variant="accent" className="!normal-case !tracking-normal">
                  {SIGNAL_LABELS[k] ?? k.replace(/_/g, " ")}
                </Pill>
              ))}
            </div>
          </div>
        )}

        <div className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-2">
          {knownSignals.length > 0 && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">
                What we know
              </div>
              <ul className="mt-3 flex flex-col gap-2">
                {knownSignals.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 text-[12.5px] leading-relaxed"
                  >
                    <CircleCheck
                      size={12}
                      strokeWidth={1.8}
                      className={cn(
                        "mt-1 shrink-0",
                        s.confidence === "high"
                          ? "text-accent"
                          : "text-text-muted",
                      )}
                    />
                    <div className="min-w-0">
                      <span className="text-text-primary">
                        {scrubBackendNames(s.signal)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {detected.length > 0 && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">
                Recent triggers
              </div>
              <ul className="mt-3 flex flex-col gap-2">
                {detected.slice(0, 6).map((s, i) => (
                  <li
                    key={i}
                    className="text-[12.5px] leading-relaxed text-text-secondary"
                  >
                    <div className="text-text-primary">
                      {scrubBackendNames(s.signal)}
                    </div>
                    {s.date && (
                      <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
                        {new Date(s.date).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {gaps.length > 0 && (
          <details className="mt-7 group">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-muted hover:text-text-secondary">
              <span className="transition-transform group-open:rotate-90">›</span>
              Open questions ({gaps.length})
            </summary>
            <ul className="mt-3 flex flex-col gap-3">
              {gaps.map((g, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-border-subtle bg-bg-elevated/30 p-3.5"
                >
                  <div className="flex items-start gap-2">
                    <CircleHelp
                      size={12}
                      strokeWidth={1.7}
                      className="mt-1 shrink-0 text-text-muted"
                    />
                    <div className="min-w-0">
                      <div className="text-[12.5px] tracking-tight text-text-primary">
                        {scrubBackendNames(g.question)}
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-text-muted">
                        {scrubBackendNames(g.why_it_matters)}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </motion.div>
  );
}
