"use client";

import { motion } from "framer-motion";
import {
  Eye,
  Building2,
  Newspaper,
  UserCog,
  Briefcase,
  TrendingUp,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import {
  Card,
  EmptyState,
  Pill,
  RelativeTime,
  SectionHeader,
  Shimmer,
} from "@/components/dashboard/primitives";
import {
  useWatchlist,
  useWatchlistAlerts,
} from "@/lib/dashboard/queries";

const ALERT_ICONS: Record<string, LucideIcon> = {
  news: Newspaper,
  blog_post: Newspaper,
  leadership_change: UserCog,
  hiring: Briefcase,
  funding: TrendingUp,
  acquisition: TrendingUp,
  partnership: TrendingUp,
  product_launch: TrendingUp,
  expansion: TrendingUp,
  threat: AlertTriangle,
  breach: AlertTriangle,
  cve: AlertTriangle,
};

function urgencyPill(u: string | null) {
  if (u === "high") return <Pill variant="danger">High</Pill>;
  if (u === "medium") return <Pill variant="warning">Medium</Pill>;
  return <Pill variant="muted">{u ?? "low"}</Pill>;
}

export function WatchlistIntel({ limit = 6 }: { limit?: number }) {
  const { data: alerts, isLoading: aLoad } = useWatchlistAlerts();
  const { data: companies, isLoading: cLoad } = useWatchlist();

  // Index watchlist companies by id for cheap O(1) name lookup. Client-side
  // join avoids changing the existing useWatchlistAlerts query shape.
  const companyById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of companies ?? []) {
      if (c.id && c.company_name) m.set(c.id, c.company_name);
    }
    return m;
  }, [companies]);

  const open = useMemo(() => {
    return (alerts ?? [])
      .filter((a) => a.status !== "dismissed")
      .slice(0, limit);
  }, [alerts, limit]);

  const isLoading = aLoad || cLoad;

  return (
    <Card delay={0.4} className="overflow-hidden">
      <div className="border-b border-border-subtle p-6 md:p-7">
        <SectionHeader
          title="What's happening at watched accounts"
          subtitle="News, leadership changes, and signals from companies on your watchlist"
          right={
            <Pill variant="outline">
              <Eye size={11} strokeWidth={1.7} />
              {(companies ?? []).length} watched
            </Pill>
          }
        />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3 p-6 md:p-7">
          {[0, 1, 2].map((i) => (
            <Shimmer key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : open.length === 0 ? (
        <EmptyState
          icon={<Building2 size={16} strokeWidth={1.6} />}
          title="No fresh intel from your watchlist"
          body="When something moves at one of your watched accounts — leadership change, product launch, breach — Vera will flag it here."
        />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {open.map((a, i) => {
            const Icon = ALERT_ICONS[a.alert_type] ?? Newspaper;
            const company = a.watchlist_id
              ? companyById.get(a.watchlist_id)
              : null;
            return (
              <motion.li
                key={a.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.4 + i * 0.05 }}
                className="flex items-start gap-3 px-6 py-4 md:px-7"
              >
                <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
                  <Icon size={13} strokeWidth={1.7} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {urgencyPill(a.urgency)}
                    {company && (
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-muted">
                        {company}
                      </span>
                    )}
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-muted">
                      <RelativeTime value={a.detected_at} />
                    </span>
                  </div>
                  <h3 className="mt-1.5 font-display text-[14px] font-medium tracking-tight text-text-primary">
                    {a.alert_title}
                  </h3>
                  {a.alert_summary && (
                    <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-text-secondary">
                      {a.alert_summary}
                    </p>
                  )}
                  {a.approach_angle && (
                    <p className="mt-2 line-clamp-2 text-[12px] italic leading-relaxed text-text-muted">
                      Angle: {a.approach_angle}
                    </p>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
