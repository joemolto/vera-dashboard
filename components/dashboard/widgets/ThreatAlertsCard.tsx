"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ExternalLink, History, ShieldAlert, Zap } from "lucide-react";
import { Pill } from "@/components/dashboard/primitives";
import { cn } from "@/lib/utils";
import type { ThreatAlertOnLead } from "@/lib/dashboard/types";

const SEVERITY_VARIANT: Record<string, "danger" | "warning" | "muted" | "outline"> = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "muted",
};

function severityVariant(s?: string) {
  if (!s) return "outline" as const;
  return SEVERITY_VARIANT[s.toLowerCase()] ?? "outline";
}

function catalogLabel(src?: string) {
  if (!src) return null;
  if (src === "cisa_kev") return "CISA KEV";
  if (src === "nvd") return "NVD";
  if (src === "ncsc") return "NCSC";
  return src.toUpperCase();
}

function formatDate(iso?: string) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

// Parse disclosure year from a CVE ID embedded in the title.
// "CVE-2009-0238 — Microsoft Excel" → 2009
function disclosureYearFromTitle(title?: string): number | null {
  if (!title) return null;
  const match = title.match(/CVE-(\d{4})-\d+/i);
  return match ? Number(match[1]) : null;
}

export function ThreatAlertsCard({ alerts }: { alerts: ThreatAlertOnLead[] }) {
  const [open, setOpen] = useState(false);

  if (!alerts || alerts.length === 0) return null;

  const criticalCount = alerts.filter(
    (a) => (a.severity ?? "").toLowerCase() === "critical",
  ).length;
  const exploitedCount = alerts.filter((a) => a.is_actively_exploited).length;

  const metaParts: string[] = [`${alerts.length} match${alerts.length === 1 ? "" : "es"}`];
  if (criticalCount > 0) metaParts.push(`${criticalCount} critical`);
  if (exploitedCount > 0) metaParts.push(`${exploitedCount} actively exploited`);
  const meta = metaParts.join(" · ");

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
      className="overflow-hidden rounded-2xl border border-border-default bg-bg-card"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-6 py-4 text-left transition-colors hover:bg-bg-elevated/30"
      >
        <ShieldAlert size={14} strokeWidth={1.7} className="shrink-0 text-accent" />
        <span className="font-display text-[14px] font-medium tracking-tight text-text-primary">
          Threat alerts in their stack
        </span>
        <span className="ml-auto flex items-center gap-3">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-muted">
            {meta}
          </span>
          <ChevronDown
            size={14}
            strokeWidth={1.7}
            className={cn(
              "text-text-muted transition-transform",
              open && "rotate-180",
            )}
          />
        </span>
      </button>

      {open && (
        <motion.ul
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.25 }}
          className="flex flex-col border-t border-border-subtle"
        >
        {alerts.map((a, i) => {
          const addedDate = formatDate(a.published_at);
          const catalog = catalogLabel(a.source);
          const techs = (a.matched_technologies ?? []).filter(Boolean);
          const disclosureYear = disclosureYearFromTitle(a.title);
          // "Resurfaced" = CVE was disclosed >= 3 years before being added back
          // to the KEV catalog. CISA does this when attackers start re-using
          // an old unpatched vuln — the gap is the sales angle (legacy
          // hygiene gap, not a fresh patch sprint).
          const addedYear = a.published_at ? new Date(a.published_at).getFullYear() : null;
          const resurfaced =
            disclosureYear != null &&
            addedYear != null &&
            addedYear - disclosureYear >= 3;
          return (
            <li
              key={`${a.url ?? a.title}-${i}`}
              className={cn(
                "px-7 py-5",
                i > 0 && "border-t border-border-subtle",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Pill variant={severityVariant(a.severity)}>
                  {(a.severity ?? "unknown").toString().toUpperCase()}
                </Pill>
                {a.is_actively_exploited && (
                  <Pill variant="danger" className="!normal-case !tracking-normal">
                    <Zap size={10} strokeWidth={2} />
                    Actively exploited
                  </Pill>
                )}
                {resurfaced && (
                  <Pill variant="warning" className="!normal-case !tracking-normal">
                    <History size={10} strokeWidth={1.8} />
                    Resurfaced (legacy gap)
                  </Pill>
                )}
                {a.url && (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-bg-base/50 px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-text-muted transition-colors hover:border-border-default hover:text-text-secondary"
                  >
                    <ExternalLink size={11} strokeWidth={1.8} />
                    Source
                  </a>
                )}
              </div>

              <h3 className="mt-3 font-display text-[14px] font-medium leading-snug tracking-tight text-text-primary">
                {a.title}
              </h3>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-muted">
                {disclosureYear && (
                  <span>
                    Disclosed{" "}
                    <span className="text-text-secondary">{disclosureYear}</span>
                  </span>
                )}
                {addedDate && catalog && (
                  <span>
                    Added to {catalog}{" "}
                    <span className="text-text-secondary">{addedDate}</span>
                  </span>
                )}
              </div>

              {a.ai_summary && (
                <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
                  {a.ai_summary}
                </p>
              )}

              {techs.length > 0 && (
                <div className="mt-3">
                  <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">
                    Matches their tech
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {techs.map((t) => (
                      <Pill key={t} variant="accent" className="!normal-case !tracking-normal">
                        {t}
                      </Pill>
                    ))}
                  </div>
                </div>
              )}

              {a.why_relevant && (
                <div className="mt-3 flex items-start gap-2 text-[12.5px] leading-relaxed">
                  <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
                    Why
                  </span>
                  <span className="text-text-secondary">{a.why_relevant}</span>
                </div>
              )}

              {a.sales_angle && (
                <div className="mt-2 flex items-start gap-2 text-[12.5px] leading-relaxed">
                  <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
                    Angle
                  </span>
                  <span className="text-text-secondary">{a.sales_angle}</span>
                </div>
              )}
            </li>
          );
        })}
        </motion.ul>
      )}
    </motion.div>
  );
}
