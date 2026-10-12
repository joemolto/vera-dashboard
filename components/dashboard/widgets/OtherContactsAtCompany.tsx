"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Users } from "lucide-react";
import { useLeads } from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";

const MULTITHREAD_PREFIX = "multithread_at_";

/**
 * Inline tabs showing other contacts surfaced for the same company as
 * the prospect being viewed. Lives on the prospect detail page just
 * above "Why this rating" — gives the rep one-click access to the
 * peers Vera multithreaded for this account, in the place where they
 * actually need them.
 *
 * Renders nothing when there are no peers, so it's safe to drop in.
 */
export function OtherContactsAtCompany({
  currentLeadId,
  companyName,
}: {
  currentLeadId: string;
  companyName: string | null | undefined;
}) {
  const { data: leads } = useLeads();

  const peers = useMemo(() => {
    if (!companyName || !leads) return [];
    const target = companyName.toLowerCase().trim();
    return leads.filter((l) => {
      if (l.id === currentLeadId) return false;
      if ((l.company_name ?? "").toLowerCase().trim() !== target) return false;
      // Surface multithreaded suggestions specifically — these are the
      // peers Vera surfaced after the rep clicked "Find others at this
      // company". Drop the multithread filter if you want to show every
      // contact at the account, not just the newly-found ones.
      const reason = (l.suggestion_reason ?? "").toLowerCase();
      return (
        reason.startsWith(MULTITHREAD_PREFIX) ||
        reason === "multithread" ||
        l.enrichment_status === "suggested" ||
        l.enrichment_status === "enriched"
      );
    });
  }, [leads, currentLeadId, companyName]);

  if (peers.length === 0) return null;

  return (
    <div className="mt-5">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">
        <Users size={11} strokeWidth={1.7} />
        Other contacts at {companyName}
        <span className="font-mono text-[10px] text-text-muted/70">
          · {peers.length}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {peers.map((p) => {
          const name =
            [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email;
          const enriched = p.enrichment_status === "enriched";
          return (
            <Link
              key={p.id}
              href={`/dashboard/prospects/${p.id}`}
              className={cn(
                "group inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5",
                "border-border-default bg-bg-elevated/50 text-[12.5px] transition-colors",
                "hover:border-accent/60 hover:bg-bg-elevated",
              )}
            >
              <span className="truncate font-display tracking-tight text-text-primary">
                {name}
              </span>
              {p.title && (
                <span className="truncate text-text-muted">· {p.title}</span>
              )}
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.18em]",
                  enriched
                    ? "bg-accent/15 text-accent"
                    : "bg-bg-base/60 text-text-muted",
                )}
              >
                {enriched ? "ready" : "new"}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
