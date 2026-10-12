"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Building2, Sparkles, Users } from "lucide-react";
import { useMemo } from "react";
import type { Lead } from "@/lib/dashboard/types";
import { useLeads } from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";

const REASON_PREFIX = "multithread_at_";

interface CompanyGroup {
  companyName: string;
  contacts: Lead[];
}

/**
 * Surfaces leads that came in via the "find others at this company" flow
 * — either user-driven (the in-context button on a prospect detail page)
 * or brain-driven (the daily multithread scan). Groups them by company so
 * the rep can see at a glance what's been multithreaded.
 *
 * Renders nothing when there are no multithread suggestions, so it's safe
 * to drop into any page.
 */
export function MultithreadingSuggestions({ leads: leadsProp }: { leads?: Lead[] } = {}) {
  // Fall back to fetching directly so the widget can be dropped onto any
  // page without the host having to pre-fetch leads.
  const { data: fetched } = useLeads();
  const leads = leadsProp ?? fetched;
  const groups = useMemo<CompanyGroup[]>(() => {
    if (!leads) return [];
    const byCompany = new Map<string, Lead[]>();
    for (const l of leads) {
      const reason = (l.suggestion_reason ?? "").toLowerCase();
      if (!reason.startsWith(REASON_PREFIX) && reason !== "multithread") continue;
      if (l.enrichment_status !== "suggested") continue;
      const company = l.company_name ?? "Unknown company";
      const arr = byCompany.get(company) ?? [];
      arr.push(l);
      byCompany.set(company, arr);
    }
    // Most recently-multithreaded companies first
    return Array.from(byCompany.entries())
      .map(([companyName, contacts]) => ({
        companyName,
        contacts: contacts.sort((a, b) => {
          const da = a.created_at ?? "";
          const db = b.created_at ?? "";
          return db.localeCompare(da);
        }),
      }))
      .sort((a, b) => {
        const da = a.contacts[0]?.created_at ?? "";
        const db = b.contacts[0]?.created_at ?? "";
        return db.localeCompare(da);
      });
  }, [leads]);

  if (groups.length === 0) return null;

  const totalContacts = groups.reduce((acc, g) => acc + g.contacts.length, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
      className="overflow-hidden rounded-2xl border border-accent/30 bg-accent/[0.04]"
    >
      <div className="flex items-center gap-2 border-b border-accent/20 bg-accent/[0.04] px-7 py-4">
        <Sparkles size={14} strokeWidth={1.7} className="text-accent" />
        <h2 className="font-display text-[1.05rem] font-medium tracking-tight text-text-primary">
          New decision-makers found at companies you&apos;ve engaged
        </h2>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
          {totalContacts} {totalContacts === 1 ? "contact" : "contacts"} ·{" "}
          {groups.length} {groups.length === 1 ? "company" : "companies"}
        </span>
      </div>

      <div className="flex flex-col divide-y divide-accent/15">
        {groups.map((g) => (
          <CompanyRow key={g.companyName} group={g} />
        ))}
      </div>
    </motion.div>
  );
}

function CompanyRow({ group }: { group: CompanyGroup }) {
  return (
    <div className="px-7 py-5">
      <div className="flex items-center gap-2">
        <Building2 size={13} strokeWidth={1.7} className="text-text-muted" />
        <h3 className="font-display text-[14px] font-medium tracking-tight text-text-primary">
          {group.companyName}
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
          · {group.contacts.length} new {group.contacts.length === 1 ? "contact" : "contacts"}
        </span>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {group.contacts.map((c) => (
          <li key={c.id}>
            <Link
              href={`/dashboard/prospects/${c.id}`}
              className={cn(
                "flex items-center gap-3 rounded-xl border border-border-subtle bg-bg-card/60 px-4 py-3 transition-colors",
                "hover:border-border-default hover:bg-bg-card",
              )}
            >
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bg-elevated font-display text-[11px] font-medium text-text-secondary">
                {[c.first_name?.[0], c.last_name?.[0]].filter(Boolean).join("")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-[13.5px] font-medium tracking-tight text-text-primary">
                  {c.first_name} {c.last_name}
                </div>
                <div className="mt-0.5 truncate text-[12px] text-text-secondary">
                  {c.title ?? "—"}
                </div>
              </div>
              <span className="ml-auto inline-flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
                <Users size={10} strokeWidth={1.7} />
                Multithread
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
