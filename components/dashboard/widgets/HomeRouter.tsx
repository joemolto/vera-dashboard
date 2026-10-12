"use client";

/**
 * HomeRouter — picks the right home layout for the current org.
 * features.home_v2 true → the newer layout (HomeV2).
 * features.home_v2 false/unset → the existing VeraBrief +
 * ActOnToday + UnifiedTimeline stack.
 *
 * Pilot 2026-06-08. Orgs without the flag stay on the legacy layout.
 */

import { PageShell } from "@/components/dashboard/primitives";
import { useOrg } from "@/components/dashboard/OrgContext";
import { useWatchlist } from "@/lib/dashboard/queries";
import { VeraBrief } from "@/components/dashboard/widgets/VeraBrief";
import { ActOnToday } from "@/components/dashboard/widgets/ActOnToday";
import { UnifiedTimeline } from "@/components/dashboard/widgets/UnifiedTimeline";
import { HomeV2 } from "@/components/dashboard/widgets/HomeV2";
import { SoloEmptyHome } from "@/components/dashboard/widgets/SoloEmptyHome";

export function HomeRouter() {
  const { features } = useOrg();
  const isSolo = !!features.solo_plan;
  const { data: watchlist } = useWatchlist();

  // A Solo org with NO accounts at all (empty watchlist) gets the focused
  // "research your first account" prompt instead of a grid of empty widgets.
  // Use the STANDING watchlist, not the monthly research counter — that resets
  // each billing cycle, which wrongly showed this empty home on the 1st of the
  // month to orgs that already have accounts.
  if (isSolo && watchlist && watchlist.length === 0) {
    return <SoloEmptyHome />;
  }

  if (features.home_v2) {
    return <HomeV2 />;
  }
  return (
    <PageShell>
      <VeraBrief />
      <div className="mt-5">
        <ActOnToday />
      </div>
      <div className="mt-5">
        <UnifiedTimeline />
      </div>
    </PageShell>
  );
}
