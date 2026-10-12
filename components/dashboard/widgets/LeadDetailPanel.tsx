"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { ExternalLink, X, Mail, Building2 } from "lucide-react";
import { Pill, RelativeTime } from "@/components/dashboard/primitives";
import { revenueDisplay } from "@/lib/dashboard/revenue";
import { scrubBackendNames } from "@/lib/dashboard/labels";
import type { Lead } from "@/lib/dashboard/types";

function fullName(l: Lead) {
  return [l.first_name, l.last_name].filter(Boolean).join(" ") || l.email;
}

export function LeadDetailPanel({
  lead,
  onClose,
}: {
  lead: Lead | null;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (lead) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lead, onClose]);

  return (
    <AnimatePresence>
      {lead && (
        <>
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.aside
            key="panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col border-l border-border-default bg-bg-card"
          >
            <header className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
              <div className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-text-muted">
                Lead detail
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-lg text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
                aria-label="Close panel"
              >
                <X size={14} strokeWidth={1.7} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-bg-elevated font-display text-[15px] font-medium text-text-primary">
                  {(fullName(lead)[0] ?? "?").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-display text-[1.15rem] font-medium tracking-tight text-text-primary">
                    {fullName(lead)}
                  </h2>
                  <div className="mt-0.5 truncate text-[13px] text-text-muted">
                    {lead.title ?? "—"}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                {lead.lead_rating === "hot" && (
                  <Pill variant="accent" className="!normal-case !tracking-normal">
                    Hot
                  </Pill>
                )}
                {lead.lead_rating === "warm" && (
                  <Pill variant="warning" className="!normal-case !tracking-normal">
                    Warm
                  </Pill>
                )}
                {lead.status && <Pill>{lead.status}</Pill>}
                {lead.enrichment_status && (
                  <Pill variant="muted">{lead.enrichment_status}</Pill>
                )}
                {lead.source && <Pill variant="outline">{lead.source}</Pill>}
              </div>

              <div className="mt-7 grid grid-cols-3 gap-3">
                <Metric label="Total" value={Number(lead.total_score ?? 0)} />
                <Metric label="ICP" value={Number(lead.icp_score ?? 0)} />
                <Metric label="Signal" value={Number(lead.signal_score ?? 0)} />
              </div>

              <Section title="Company">
                <DataRow label="Name" value={lead.company_name} />
                <DataRow
                  label="Domain"
                  value={
                    lead.company_domain ? (
                      <a
                        href={`https://${lead.company_domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-text-primary underline-offset-4 hover:underline"
                      >
                        {lead.company_domain}
                        <ExternalLink size={11} strokeWidth={1.7} />
                      </a>
                    ) : null
                  }
                />
                <DataRow label="Industry" value={lead.company_industry} />
                <DataRow label="Size" value={lead.company_size} />
                <DataRow label="Location" value={lead.company_location} />
              </Section>

              <Section title="Contact">
                <DataRow
                  label="Email"
                  value={
                    lead.email ? (
                      <a
                        href={`mailto:${lead.email}`}
                        className="inline-flex items-center gap-1 text-text-primary underline-offset-4 hover:underline"
                      >
                        {lead.email}
                      </a>
                    ) : null
                  }
                />
                <DataRow
                  label="LinkedIn"
                  value={
                    lead.linkedin_url ? (
                      <a
                        href={lead.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-text-primary underline-offset-4 hover:underline"
                      >
                        Profile
                        <ExternalLink size={11} strokeWidth={1.7} />
                      </a>
                    ) : null
                  }
                />
                <DataRow
                  label="Last enriched"
                  value={<RelativeTime value={lead.enriched_at} />}
                />
              </Section>

              {lead.best_approach_angle && (
                <Section title="Best approach angle">
                  <p className="whitespace-pre-line text-[13px] leading-relaxed text-text-secondary">
                    {scrubBackendNames(lead.best_approach_angle)}
                  </p>
                </Section>
              )}

              {lead.rating_reason && (
                <Section title="Why this rating">
                  <p className="text-[13px] leading-relaxed text-text-secondary">
                    {scrubBackendNames(lead.rating_reason)}
                  </p>
                </Section>
              )}

              {(() => {
                const rv = revenueDisplay(lead.revenue_potential);
                if (!rv) return null;
                const c = lead.enrichment_data?.gtm_briefing?.commercial;
                const angle =
                  c?.positioning ??
                  lead.revenue_potential?.recommended_commercial_angle;
                return (
                  <Section title="Commercial upside">
                    <p className="font-mono text-[13px] text-text-primary">
                      {rv.estimate}
                      {rv.range && (
                        <span className="text-text-muted"> · {rv.range}</span>
                      )}
                      {rv.confidence && (
                        <span className="text-text-muted">
                          {" "}
                          · {rv.confidence} confidence
                        </span>
                      )}
                    </p>
                    {c?.why && (
                      <p className="text-[13px] leading-relaxed text-text-secondary">
                        {c.why}
                      </p>
                    )}
                    {angle && (
                      <p className="text-[13px] leading-relaxed text-text-secondary">
                        {angle}
                      </p>
                    )}
                  </Section>
                );
              })()}
            </div>

            <footer className="flex items-center gap-2 border-t border-border-subtle px-6 py-4">
              {lead.email && (
                <a
                  href={`mailto:${lead.email}`}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-text-primary px-4 py-2.5 text-[13px] font-medium tracking-tight text-bg-base transition-opacity hover:opacity-90"
                >
                  <Mail size={13} strokeWidth={1.7} />
                  Email {lead.first_name ?? "lead"}
                </a>
              )}
              {lead.linkedin_url && (
                <a
                  href={lead.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-default px-4 py-2.5 text-[13px] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
                >
                  <Building2 size={13} strokeWidth={1.7} />
                  LinkedIn
                </a>
              )}
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-bg-elevated/40 px-3 py-3 text-center">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-text-muted">
        {label}
      </div>
      <div className="mt-1 font-display text-[1.1rem] font-medium tracking-tight text-text-primary">
        {Math.round(value)}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-7">
      <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">
        {title}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function DataRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-muted">
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate text-right text-text-primary">
        {value}
      </span>
    </div>
  );
}
