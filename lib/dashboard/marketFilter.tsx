"use client";

/**
 * Market filter for list pages (accounts / prospects) — multi_market pilot.
 *
 * An account belongs to exactly one market (watchlist.market_id, NULL =
 * primary), so people and prospects scope through their account's market —
 * no market column on leads needed. The filter only materialises when the
 * org has features.multi_market AND more than one market; for everyone
 * else the hook returns inert values and the pages render exactly as
 * before. Selection is shared across pages per org via localStorage
 * ("" = all markets).
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrg } from "@/components/dashboard/OrgContext";
import {
  type MarketRecord,
  type MarketsListResponse,
} from "@/components/dashboard/widgets/MarketEditorDrawer";
import { claraApi } from "@/lib/dashboard/claraApi";
import type { WatchlistCompany } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

export function useMarketFilter() {
  const { orgId, features } = useOrg();
  const marketsQuery = useQuery({
    // Same key as the market page — one fetch serves every surface.
    queryKey: ["markets", orgId],
    enabled: !!features.market_v1,
    queryFn: () =>
      claraApi<MarketsListResponse>("/accounts/market/markets", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId }),
      }),
    staleTime: 5 * 60 * 1000,
  });
  const markets = useMemo(
    () => marketsQuery.data?.markets ?? [],
    [marketsQuery.data],
  );
  const enabled = !!features.multi_market && markets.length > 1;

  const [filterId, setFilterId] = useState<string>(() =>
    typeof window === "undefined"
      ? ""
      : (window.localStorage.getItem(`vera-market-filter-${orgId}`) ?? ""),
  );
  useEffect(() => {
    if (filterId) window.localStorage.setItem(`vera-market-filter-${orgId}`, filterId);
    else window.localStorage.removeItem(`vera-market-filter-${orgId}`);
  }, [orgId, filterId]);
  // A stored selection whose market has been deleted falls back to all.
  useEffect(() => {
    if (filterId && marketsQuery.data && !markets.some((m) => m.id === filterId)) {
      setFilterId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterId, marketsQuery.data]);

  const selected = (enabled && markets.find((m) => m.id === filterId)) || null;
  return { markets, enabled, filterId, setFilterId, selected };
}

/** Does a watchlist row belong to this market? NULL market_id = primary. */
export function rowInMarket(
  market: MarketRecord,
  marketId: string | null | undefined,
): boolean {
  if (market.is_primary) return !marketId || marketId === market.id;
  return marketId === market.id;
}

/** Domains of the accounts in the selected market — null when no filter is
 * active, so callers can skip filtering entirely. */
export function useMarketDomains(
  selected: MarketRecord | null,
  watchlist: WatchlistCompany[] | undefined,
): ReadonlySet<string> | null {
  return useMemo(() => {
    if (!selected) return null;
    const set = new Set<string>();
    for (const w of watchlist ?? []) {
      if (rowInMarket(selected, w.market_id)) {
        const d = (w.company_domain ?? "").toLowerCase();
        if (d) set.add(d);
      }
    }
    return set;
  }, [selected, watchlist]);
}

export function MarketFilterPills({
  markets,
  filterId,
  onChange,
}: {
  markets: MarketRecord[];
  filterId: string;
  onChange: (id: string) => void;
}) {
  const pill = (active: boolean) =>
    cn(
      "rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors",
      active
        ? "border-accent/50 bg-accent/10 text-accent"
        : "border-border-default text-text-secondary hover:text-text-primary",
    );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={() => onChange("")} className={pill(!filterId)}>
        All markets
      </button>
      {markets.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(filterId === m.id ? "" : m.id)}
          className={pill(filterId === m.id)}
        >
          {m.name}
        </button>
      ))}
    </div>
  );
}
