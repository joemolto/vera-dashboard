"use client";

/**
 * Competitor watch — a light feed of what the org's competitors posted on
 * LinkedIn recently, and the security people who engaged with each post.
 *
 * Zero-config: the engine resolves competitors from client context (or a
 * curated sector default) and writes one row per post to competitor_feed
 * on a weekly scan. Gated per-org via features.competitor_feed.
 *
 * Product rules honoured: names are always links (LinkedIn), honest empty
 * state, sentence case, no backend tool names.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card, SectionHeader, Shimmer } from "@/components/dashboard/primitives";
import { useOrg } from "@/components/dashboard/OrgContext";
import {
  Facepile,
  LinkedInPostCard,
  type PostEngagement,
} from "@/components/dashboard/widgets/LinkedInPostCard";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Engager = {
  name: string;
  title: string;
  linkedin_url: string;
  picture_url?: string | null;
  kind: "reaction" | "comment";
  is_leader: boolean;
};

type FeedRow = {
  id: string;
  competitor: string;
  competitor_domain: string | null;
  post_url: string;
  post_text: string | null;
  posted_at: string | null;
  engagement: PostEngagement | null;
  security_engagers: Engager[];
  engager_count: number;
};

function useCompetitorFeed() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["competitor_feed", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const sb = createSupabaseBrowserClient();
      const { data, error } = await sb
        .from("competitor_feed")
        .select(
          "id, competitor, competitor_domain, post_url, post_text, posted_at, engagement, security_engagers, engager_count",
        )
        .order("posted_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as FeedRow[];
    },
    staleTime: 10 * 60_000, // the scan runs weekly; no need to refetch hard
  });
}

export function CompetitorWatch() {
  const feed = useCompetitorFeed();
  const rows = useMemo(() => feed.data ?? [], [feed.data]);

  return (
    <Card>
      <div className="p-5 pb-0">
      <SectionHeader title="Competitor watch" />
      </div>
      {feed.isLoading ? (
        <div className="flex flex-col gap-3 px-5 pb-5">
          <Shimmer className="h-14 w-full" />
          <Shimmer className="h-14 w-full" />
          <Shimmer className="h-14 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="px-5 pb-5 text-[13px] text-text-muted">
          Nothing from your competitors this week.
        </p>
      ) : (
        <ul className="mx-5 mb-5 flex max-h-[430px] flex-col gap-4 overflow-y-auto pb-6 pr-1 [scrollbar-width:thin] [mask-image:linear-gradient(to_bottom,black_calc(100%-36px),transparent)]">
          {rows.map((row) => {
            const leaders = row.security_engagers.filter((e) => e.is_leader);
            const shown = (leaders.length ? leaders : row.security_engagers).slice(0, 3);
            const more = row.engager_count - shown.length;
            return (
              <li key={row.id} className="flex flex-col gap-1.5">
                <LinkedInPostCard
                  authorName={row.competitor}
                  authorDomain={row.competitor_domain}
                  postedAt={row.posted_at}
                  text={row.post_text || "View the post on LinkedIn"}
                  engagement={row.engagement}
                  url={row.post_url}
                />
                {row.engager_count > 0 && (
                  <div className="flex items-center gap-2 px-1">
                    <Facepile people={row.security_engagers} />
                  <p className="text-[12px] leading-relaxed text-text-muted">
                    {row.engager_count} security {row.engager_count === 1 ? "person" : "people"} engaged
                    {shown.length > 0 && (
                      <>
                        {", including "}
                        {shown.map((e, i) => (
                          <span key={e.linkedin_url || e.name}>
                            {i > 0 && ", "}
                            <a
                              href={e.linkedin_url || undefined}
                              target="_blank"
                              rel="noreferrer"
                              className="text-text-secondary underline decoration-border-subtle underline-offset-2 hover:text-text-primary"
                              title={e.title}
                            >
                              {e.name}
                            </a>
                          </span>
                        ))}
                        {more > 0 && ` and ${more} more`}
                      </>
                    )}
                    .
                  </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
