"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Search, Users, ArrowUpRight, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Card,
  EmptyState,
  PageHeader,
  PageShell,
  Pill,
  Shimmer,
} from "@/components/dashboard/primitives";
import { useLeads, useWatchlist } from "@/lib/dashboard/queries";
import {
  MarketFilterPills,
  useMarketDomains,
  useMarketFilter,
} from "@/lib/dashboard/marketFilter";
import { AddToGroupButton } from "@/components/dashboard/widgets/AddToGroupButton";
import { SendToButton } from "@/components/dashboard/widgets/SendToButton";
import { proxiedAvatar } from "@/lib/dashboard/labels";
import { CompanyMark } from "@/components/dashboard/CompanyMark";
import { companyRevenueDisplay, revenueDisplay } from "@/lib/dashboard/revenue";
import type { Lead } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

const RATING_FILTERS = ["all", "hot", "warm", "cold", "unrated"] as const;
type Rating = (typeof RATING_FILTERS)[number];

const PAGE_SIZE = 25;

function fullName(l: Lead) {
  return [l.first_name, l.last_name].filter(Boolean).join(" ") || l.email;
}

// Person avatar — the enriched LinkedIn/Apollo photo when we have one,
// falling back to the initial on a missing or broken image (LinkedIn CDN
// URLs can hotlink-block, so the fallback matters).
function PersonAvatar({ photo, name }: { photo: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  const src = proxiedAvatar(photo);
  if (!src || failed) {
    return (
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bg-elevated font-display text-[11px] font-medium text-text-primary">
        {initial}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      width={32}
      height={32}
      onError={() => setFailed(true)}
      className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
    />
  );
}

export default function ProspectsPage() {
  const router = useRouter();
  const { data, isLoading } = useLeads();
  const [query, setQuery] = useState("");
  const [rating, setRating] = useState<Rating>("all");
  const [page, setPage] = useState(0);

  // Market filter (multi_market pilot) — a prospect follows its account's
  // market, so the filter scopes by watchlist domain. Inert for orgs
  // without >1 market.
  const { data: watchlist } = useWatchlist();
  const marketFilter = useMarketFilter();
  const marketDomains = useMarketDomains(marketFilter.selected, watchlist);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = (data ?? []).filter((l) => {
      if (
        marketDomains &&
        !marketDomains.has((l.company_domain ?? "").toLowerCase())
      )
        return false;
      if (rating !== "all" && l.lead_rating !== rating) return false;
      if (!q) return true;
      const blob = [
        l.email,
        l.first_name,
        l.last_name,
        l.title,
        l.company_name,
        l.company_industry,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
    // Primary order: score desc (as the engine ranks). Tie-break: people
    // with a photo first, so the strongest-looking rows lead the table.
    return rows.sort((a, b) => {
      const sa = Number(a.total_score ?? 0);
      const sb = Number(b.total_score ?? 0);
      if (sb !== sa) return sb - sa;
      return (a.photo_url ? 0 : 1) - (b.photo_url ? 0 : 1);
    });
  }, [data, query, rating, marketDomains]);

  // Reset to the first page whenever the filter or search changes.
  useEffect(() => setPage(0), [query, rating, marketFilter.filterId]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Prospects"
        title="Every prospect Vera has researched for you"
        subtitle="Sourced, enriched, scored against your ICP — click any row for the full briefing."
        right={
          <div className="flex items-center gap-2">
            <Pill variant="outline">
              <Users size={11} strokeWidth={1.7} />
              {(data ?? []).length}
            </Pill>
            <Link
              href="/dashboard/research"
              className="inline-flex items-center gap-1.5 rounded-full bg-text-primary px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-bg-base transition-opacity hover:opacity-90"
            >
              <Sparkles size={11} strokeWidth={1.8} />
              Research new
            </Link>
          </div>
        }
      />

      <div className="mt-8 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search
            size={14}
            strokeWidth={1.7}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, title, company…"
            className="w-full rounded-lg border border-border-default bg-bg-card py-2.5 pl-9 pr-3 text-[13.5px] text-text-primary placeholder:text-text-muted/70 outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border-default bg-bg-card p-1">
          {RATING_FILTERS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRating(r)}
              className={cn(
                "rounded-md px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] transition-colors",
                rating === r
                  ? "bg-bg-elevated text-text-primary"
                  : "text-text-muted hover:text-text-secondary",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        {marketFilter.enabled && (
          <MarketFilterPills
            markets={marketFilter.markets}
            filterId={marketFilter.filterId}
            onChange={marketFilter.setFilterId}
          />
        )}
      </div>

      <Card delay={0.15} className="mt-5 overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-6">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <Shimmer key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Users size={16} strokeWidth={1.6} />}
            title="No leads match"
            body="Adjust the filter or search term."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-border-subtle text-[10.5px] uppercase tracking-[0.18em] text-text-muted">
                  <th className="px-6 py-3 font-mono font-normal">Name</th>
                  <th className="px-3 py-3 font-mono font-normal">Job title</th>
                  <th className="px-3 py-3 font-mono font-normal">Company</th>
                  <th className="px-3 py-3 font-mono font-normal">Industry</th>
                  <th className="px-3 py-3 text-right font-mono font-normal">Company rev.</th>
                  <th className="px-3 py-3 font-mono font-normal">Signal</th>
                  <th className="px-3 py-3 text-right font-mono font-normal">Score</th>
                  <th className="px-3 py-3 font-mono font-normal">Rating</th>
                  <th className="px-3 py-3 text-right font-mono font-normal">Est. value</th>
                  <th className="px-3 py-3 font-mono font-normal">Action</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((l, i) => (
                  <motion.tr
                    key={l.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: 0.2 + i * 0.012 }}
                    className="cursor-pointer border-b border-border-subtle last:border-b-0 transition-colors hover:bg-bg-elevated/40"
                    onClick={() => router.push(`/dashboard/prospects/${l.id}`)}
                  >
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <PersonAvatar photo={l.photo_url} name={fullName(l)} />
                        <div className="min-w-0 truncate font-display text-[13.5px] font-medium tracking-tight text-text-primary">
                          {fullName(l)}
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[12rem] truncate px-3 py-3.5 text-[12px] text-text-secondary">
                      {l.title ?? "—"}
                    </td>
                    <td className="max-w-[11rem] px-3 py-3.5 text-text-secondary">
                      <div className="flex items-center gap-2">
                        <CompanyMark domain={l.company_domain} name={l.company_name} />
                        <span className="truncate">{l.company_name ?? "—"}</span>
                      </div>
                    </td>
                    <td className="max-w-[10rem] truncate px-3 py-3.5 text-[12px] text-text-muted">
                      {l.company_industry ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-right font-mono text-[12px] text-text-secondary">
                      {companyRevenueDisplay(l.company_revenue) ?? (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="max-w-[20rem] px-3 py-3.5">
                      {(() => {
                        const sigs = (l.signal_summary ?? []).filter(Boolean);
                        if (sigs.length === 0)
                          return <span className="text-text-muted">—</span>;
                        return (
                          <div className="flex flex-col gap-0.5">
                            {sigs.slice(0, 2).map((s, si) => (
                              <div
                                key={si}
                                className="truncate text-[11.5px] text-text-secondary"
                                title={s}
                              >
                                {s}
                              </div>
                            ))}
                            {sigs.length > 2 && (
                              <div className="text-[10.5px] text-text-muted">
                                +{sigs.length - 2} more
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono text-[12px] text-text-primary">
                      {Math.round(Number(l.total_score ?? 0))}
                    </td>
                    <td className="px-3 py-3.5">
                      {l.lead_rating === "hot" && (
                        <Pill variant="accent" className="!normal-case !tracking-normal">
                          Hot
                        </Pill>
                      )}
                      {l.lead_rating === "warm" && (
                        <Pill variant="warning" className="!normal-case !tracking-normal">
                          Warm
                        </Pill>
                      )}
                      {l.lead_rating === "cold" && (
                        <Pill variant="muted" className="!normal-case !tracking-normal">
                          Cold
                        </Pill>
                      )}
                      {(!l.lead_rating || l.lead_rating === "unrated") && (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-right font-mono text-[12px] text-text-primary">
                      {(() => {
                        const rv = revenueDisplay(l.revenue_potential);
                        if (!rv) return <span className="text-text-muted">—</span>;
                        return rv.range ?? rv.estimate;
                      })()}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-[12px]">
                      {(() => {
                        const a = l.recommended_action;
                        if (!a) return <span className="text-text-muted">—</span>;
                        const label =
                          a === "reach_out_now"
                            ? "Reach out"
                            : a === "skip"
                              ? "Skip"
                              : a === "nurture_sequence"
                                ? "Nurture"
                                : a
                                    .replace(/_/g, " ")
                                    .replace(/\b\w/g, (c) => c.toUpperCase());
                        return (
                          <span
                            className={
                              a === "skip"
                                ? "text-text-muted"
                                : "font-medium text-text-primary"
                            }
                          >
                            {label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <SendToButton id={l.id} variant="pill" />
                        <AddToGroupButton leadId={l.id} variant="icon" />
                        <ArrowUpRight
                          size={13}
                          strokeWidth={1.7}
                          className="text-text-muted"
                        />
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
            {total > PAGE_SIZE && (
              <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-6 py-3">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-muted">
                  {start + 1}–{Math.min(start + PAGE_SIZE, total)} of {total}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={safePage === 0}
                    className="rounded-full border border-border-subtle px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-secondary transition-colors hover:bg-bg-elevated disabled:pointer-events-none disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <span className="font-mono text-[10.5px] tabular-nums text-text-muted">
                    {safePage + 1} / {pageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    disabled={safePage >= pageCount - 1}
                    className="rounded-full border border-border-subtle px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-secondary transition-colors hover:bg-bg-elevated disabled:pointer-events-none disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

    </PageShell>
  );
}
