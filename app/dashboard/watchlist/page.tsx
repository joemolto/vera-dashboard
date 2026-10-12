"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useMemo, useState } from "react";
import { Eye, ExternalLink, Building2, Bell } from "lucide-react";
import {
  Card,
  EmptyState,
  KpiCard,
  PageHeader,
  PageShell,
  Pill,
  RelativeTime,
  SectionHeader,
  Shimmer,
} from "@/components/dashboard/primitives";
import { useWatchlist, useWatchlistAlerts } from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";

const ALERT_LABELS: Record<string, string> = {
  website_change: "Website",
  tech_stack_added: "Tech stack",
  tech_stack_removed: "Tech stack",
  contact_activity: "Contact",
  hiring: "Hiring",
  funding: "Funding",
  press: "Press",
};

const ALL_KEY = "__all__";

function urgencyPill(u: string | null) {
  if (u === "high") return <Pill variant="danger">High</Pill>;
  if (u === "medium") return <Pill variant="warning">Medium</Pill>;
  return <Pill variant="muted">{u ?? "low"}</Pill>;
}

export default function WatchlistPage() {
  const { data: companies, isLoading: cLoad } = useWatchlist();
  const { data: alerts, isLoading: aLoad } = useWatchlistAlerts();

  const totalCompanies = (companies ?? []).length;
  const newAlerts = (alerts ?? []).filter((a) => a.status === "new").length;
  const last24 = (alerts ?? []).filter(
    (a) =>
      a.detected_at &&
      Date.now() - new Date(a.detected_at).getTime() < 24 * 60 * 60 * 1000,
  ).length;

  // Per-company alert counts so the left list can surface where there's
  // unread movement.
  const alertCountsById = useMemo(() => {
    const counts: Record<string, { total: number; newCount: number }> = {};
    for (const a of alerts ?? []) {
      if (!a.watchlist_id) continue;
      if (!counts[a.watchlist_id]) counts[a.watchlist_id] = { total: 0, newCount: 0 };
      counts[a.watchlist_id].total += 1;
      if ((a.status ?? "new") === "new") counts[a.watchlist_id].newCount += 1;
    }
    return counts;
  }, [alerts]);

  // Default: company with the most new alerts; otherwise the first.
  const defaultKey = useMemo(() => {
    const list = companies ?? [];
    if (list.length === 0) return ALL_KEY;
    let best = list[0].id;
    let bestNew = alertCountsById[best]?.newCount ?? 0;
    for (const c of list) {
      const n = alertCountsById[c.id]?.newCount ?? 0;
      if (n > bestNew) {
        best = c.id;
        bestNew = n;
      }
    }
    return best;
  }, [companies, alertCountsById]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeKey = selectedId ?? defaultKey;

  const selectedCompany =
    activeKey === ALL_KEY
      ? null
      : (companies ?? []).find((c) => c.id === activeKey) ?? null;

  const filteredAlerts = useMemo(() => {
    const list = alerts ?? [];
    if (activeKey === ALL_KEY) return list;
    return list.filter((a) => a.watchlist_id === activeKey);
  }, [alerts, activeKey]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Watchlist"
        title="The accounts Vera watches around the clock"
        subtitle="Click a company on the left to see its alerts — or use ‘All accounts’ for the full feed."
      />

      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          label="Companies"
          value={totalCompanies}
          hint="Under active monitoring"
          icon={<Building2 size={14} strokeWidth={1.6} />}
          loading={cLoad}
          delay={0}
        />
        <KpiCard
          label="Alerts · 24h"
          value={last24}
          icon={<Bell size={14} strokeWidth={1.6} />}
          loading={aLoad}
          delay={0.05}
        />
        <KpiCard
          label="New · unactioned"
          value={newAlerts}
          icon={<Eye size={14} strokeWidth={1.6} />}
          loading={aLoad}
          delay={0.1}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card delay={0.15} className="xl:col-span-1 overflow-hidden">
          <div className="border-b border-border-subtle p-6">
            <SectionHeader title="Monitored accounts" />
          </div>
          {cLoad ? (
            <div className="flex flex-col gap-2 p-6">
              {[0, 1, 2, 3, 4].map((i) => (
                <Shimmer key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (companies ?? []).length === 0 ? (
            <EmptyState
              icon={<Building2 size={16} strokeWidth={1.6} />}
              title="No companies yet"
              body="Add a company to your watchlist to start receiving alerts."
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              <li>
                <button
                  type="button"
                  onClick={() => setSelectedId(ALL_KEY)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-6 py-3.5 text-left transition-colors",
                    activeKey === ALL_KEY
                      ? "bg-accent/10"
                      : "hover:bg-bg-elevated/40",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={cn(
                        "grid h-7 w-7 shrink-0 place-items-center rounded-full",
                        activeKey === ALL_KEY
                          ? "bg-accent/20 text-accent"
                          : "bg-bg-elevated text-text-muted",
                      )}
                    >
                      <Bell size={12} strokeWidth={1.7} />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-display text-[13.5px] font-medium tracking-tight text-text-primary">
                        All accounts
                      </div>
                      <div className="mt-0.5 truncate text-[11.5px] text-text-muted">
                        Full feed
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[10.5px] text-text-muted">
                    {(alerts ?? []).length}
                  </span>
                </button>
              </li>
              {(companies ?? []).map((c, i) => {
                const counts = alertCountsById[c.id];
                const isActive = activeKey === c.id;
                return (
                  <motion.li
                    key={c.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.2 + i * 0.04 }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-6 py-3.5 text-left transition-colors",
                        isActive
                          ? "bg-accent/10"
                          : "hover:bg-bg-elevated/40",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            c.monitoring_active ? "bg-accent" : "bg-text-muted",
                          )}
                        />
                        <div className="min-w-0">
                          <div className="truncate font-display text-[13.5px] font-medium tracking-tight text-text-primary">
                            {c.company_name}
                          </div>
                          <div className="mt-0.5 truncate text-[11.5px] text-text-muted">
                            {c.target_contact_name ?? c.company_domain}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {counts?.newCount ? (
                          <span className="rounded-full bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-accent">
                            {counts.newCount} new
                          </span>
                        ) : counts?.total ? (
                          <span className="font-mono text-[10.5px] text-text-muted">
                            {counts.total}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card delay={0.25} className="xl:col-span-2 overflow-hidden">
          <div className="border-b border-border-subtle p-6 md:p-7">
            <SectionHeader
              title={
                selectedCompany
                  ? `${selectedCompany.company_name} · recent alerts`
                  : "Recent alerts · all accounts"
              }
              subtitle={
                selectedCompany
                  ? "Movement Vera detected at this account"
                  : "What's changed across the watchlist"
              }
              right={
                selectedCompany?.company_domain ? (
                  <a
                    href={`https://${selectedCompany.company_domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-muted hover:text-text-primary"
                  >
                    {selectedCompany.company_domain}
                    <ExternalLink size={11} strokeWidth={1.7} />
                  </a>
                ) : undefined
              }
            />
          </div>
          {aLoad ? (
            <div className="flex flex-col gap-2 p-6">
              {[0, 1, 2, 3].map((i) => (
                <Shimmer key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : filteredAlerts.length === 0 ? (
            <EmptyState
              icon={<Bell size={16} strokeWidth={1.6} />}
              title={
                selectedCompany
                  ? `No recent alerts for ${selectedCompany.company_name}`
                  : "No alerts yet"
              }
              body={
                selectedCompany
                  ? "Vera's watching — anything meaningful will show up here as soon as it breaks."
                  : "When Vera detects a meaningful change at one of these accounts, it lands here."
              }
            />
          ) : (
            <AnimatePresence mode="popLayout">
              <ul className="divide-y divide-border-subtle">
                {filteredAlerts.slice(0, 30).map((a, i) => (
                  <motion.li
                    key={a.id}
                    layout
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.3) }}
                    className="flex flex-col gap-2 px-6 py-4 md:px-7"
                  >
                    <div className="flex items-center gap-2">
                      {urgencyPill(a.urgency)}
                      <Pill variant="outline">
                        {ALERT_LABELS[a.alert_type] ?? a.alert_type}
                      </Pill>
                      {a.status && a.status !== "new" && (
                        <Pill variant="muted">{a.status}</Pill>
                      )}
                      <span className="ml-auto font-mono text-[10.5px] uppercase tracking-[0.18em]">
                        <RelativeTime value={a.detected_at} />
                      </span>
                    </div>
                    <div className="font-display text-[13.5px] font-medium tracking-tight text-text-primary">
                      {a.alert_title}
                    </div>
                    {a.alert_summary && (
                      <p className="line-clamp-3 text-[12.5px] leading-relaxed text-text-secondary">
                        {a.alert_summary}
                      </p>
                    )}
                  </motion.li>
                ))}
              </ul>
            </AnimatePresence>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
