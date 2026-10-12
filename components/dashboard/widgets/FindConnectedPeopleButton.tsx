"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  ExternalLink,
  Link as LinkIcon,
  Loader2,
  Users,
  X,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  BUYING_ROLE_LABELS,
  deriveBuyingRole,
  type BuyingRole,
} from "@/lib/dashboard/cyberIntent";
import { cn } from "@/lib/utils";

interface ConnectedPerson {
  apollo_id: string | null;
  first_name: string;
  last_name: string;
  last_name_obfuscated: string;
  title: string;
  seniority: string;
  linkedin_url: string;
  city: string;
  country: string;
  headline: string;
}

interface Props {
  /** The contact this button hangs off — used to exclude them from results. */
  apolloId: string | null;
  /** The account domain to search. */
  domain: string;
  /** Friendly name for header copy (e.g. "Monzo Bank"). */
  companyName: string;
  /** Friendly name for the contact (e.g. "Sarah Smith") — used in modal copy. */
  contactName: string;
}

const BUYING_ROLE_BADGE: Record<BuyingRole, string> = {
  "decision-maker": "border-rose-400/40 bg-rose-400/10 text-rose-200",
  "technical-evaluator": "border-sky-400/30 bg-sky-400/5 text-sky-200",
  influencer: "border-amber-400/30 bg-amber-400/5 text-amber-200",
  "end-user": "border-emerald-400/30 bg-emerald-400/5 text-emerald-200",
  other: "border-border-default bg-bg-elevated text-text-muted",
};

// Senior leaders, broader than ICP — the whole point of "find connected"
// is to surface decision-makers the ICP filter would miss (CFO, COO,
// CTO, Head of IT, etc.).
const SENIOR_SENIORITIES = ["c_suite", "founder", "owner", "vp", "director", "head"];

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; people: ConnectedPerson[]; total: number }
  | { kind: "error"; message: string };

export function FindConnectedPeopleButton({
  apolloId,
  domain,
  companyName,
  contactName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });

  const onOpen = async () => {
    setOpen(true);
    if (state.kind === "loaded") return; // cached, don't re-fetch
    setState({ kind: "loading" });
    try {
      const sb = createSupabaseBrowserClient();
      const { data, error } = await sb.functions.invoke<{
        people: ConnectedPerson[];
        total: number;
      }>("apollo-people", {
        body: {
          domain,
          seniorities: SENIOR_SENIORITIES,
          exclude_apollo_id: apolloId ?? undefined,
          limit: 50,
        },
      });
      if (error) throw error;
      setState({
        kind: "loaded",
        people: data?.people ?? [],
        total: data?.total ?? 0,
      });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Couldn't load connections",
      });
    }
  };

  const onClose = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center gap-1.5 rounded-md border border-border-default bg-bg-base/40 px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-text-muted transition-colors hover:border-border-default hover:text-text-primary"
        aria-label={`Find connected people at ${companyName}`}
      >
        <LinkIcon size={10} strokeWidth={1.8} />
        Find connected
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 grid place-items-center bg-bg-base/70 px-4 py-8 backdrop-blur-sm"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[calc(100vh-4rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-card"
            >
              {/* Header */}
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-subtle px-7 py-5">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-bg-elevated">
                    <Building2
                      size={16}
                      strokeWidth={1.7}
                      className="text-accent"
                    />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display text-[1.05rem] font-medium tracking-tight text-text-primary">
                      Connected to {contactName}
                    </h3>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">
                      Other senior leaders at {companyName} — possible champions,
                      paths in, or parallel buyers.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-bg-elevated/50 hover:text-text-primary"
                >
                  <X size={12} strokeWidth={1.8} />
                </button>
              </div>

              {/* Body */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-7 py-5">
                {state.kind === "loading" && (
                  <div className="grid place-items-center py-12">
                    <Loader2
                      size={20}
                      strokeWidth={2}
                      className="animate-spin text-text-muted"
                    />
                    <p className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-muted">
                      Vera is finding connected leaders…
                    </p>
                  </div>
                )}
                {state.kind === "error" && (
                  <div className="rounded-xl border border-rose-400/30 bg-rose-400/5 p-4 text-[13px] text-rose-200">
                    {state.message}
                  </div>
                )}
                {state.kind === "loaded" && state.people.length === 0 && (
                  <div className="grid place-items-center py-12 text-center">
                    <Users size={20} className="text-text-muted" aria-hidden />
                    <p className="mt-4 text-[13px] text-text-secondary">
                      No other senior leaders found at this company.
                    </p>
                  </div>
                )}
                {state.kind === "loaded" && state.people.length > 0 && (
                  <ul className="flex flex-col gap-2.5">
                    {state.people.map((p, i) => {
                      const role = deriveBuyingRole({
                        title: p.title,
                        seniority: p.seniority,
                      });
                      const displayLastName =
                        p.last_name || p.last_name_obfuscated || "•••";
                      const fullName = `${p.first_name} ${displayLastName}`.trim();
                      const location = [p.city, p.country]
                        .filter(Boolean)
                        .join(", ");
                      return (
                        <li
                          key={p.apollo_id ?? `${p.first_name}-${i}`}
                          className="rounded-xl border border-border-subtle bg-bg-base/30 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-display text-[14px] font-medium text-text-primary">
                                {fullName}
                              </div>
                              {p.title && (
                                <div className="mt-0.5 truncate text-[12.5px] text-text-secondary">
                                  {p.title}
                                </div>
                              )}
                              {location && (
                                <div className="mt-1 text-[11.5px] text-text-muted">
                                  {location}
                                </div>
                              )}
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1.5">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em]",
                                  BUYING_ROLE_BADGE[role],
                                )}
                              >
                                {BUYING_ROLE_LABELS[role]}
                              </span>
                              {p.linkedin_url && (
                                <a
                                  href={p.linkedin_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-text-muted transition hover:text-text-primary"
                                  aria-label={`Open ${fullName}'s LinkedIn`}
                                >
                                  <ExternalLink size={14} />
                                </a>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Footer */}
              {state.kind === "loaded" && (
                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border-subtle bg-bg-base/30 px-7 py-4">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-muted">
                    {state.total} surfaced
                  </span>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full px-4 py-2 text-[13px] text-text-secondary transition-colors hover:text-text-primary"
                  >
                    Close
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
