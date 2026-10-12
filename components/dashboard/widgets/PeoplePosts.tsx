"use client";

/**
 * People posts — LinkedIn-style cards of what the org's watched people
 * posted or engaged with, rendered as the post itself (not a headline).
 * Reads the person_* signals the weekly person monitor writes; newer
 * signals carry full post text + engagement, older ones fall back to
 * the classifier's quoted excerpt. Gated via features.people_feed.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card, SectionHeader, Shimmer } from "@/components/dashboard/primitives";
import { useOrg } from "@/components/dashboard/OrgContext";
import {
  LinkedInPostCard,
  type PostEngagement,
} from "@/components/dashboard/widgets/LinkedInPostCard";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const PERSON_SIGNAL_TYPES = [
  "person_posted_relevant_topic",
  "person_engaged_with_topic",
  "person_engaged_with_competitor",
] as const;

type PersonSignalData = {
  person_name?: string;
  person_title?: string;
  person_linkedin_url?: string;
  kind?: "post" | "comment" | "reaction";
  headline?: string;
  summary?: string;
  quoted_excerpt?: string;
  post_text?: string;
  comment_text?: string;
  original_post_author?: string;
  posted_at?: string | null;
  engagement?: PostEngagement;
  url?: string;
  /** Older person signals stored the post link under source_url. */
  source_url?: string;
};

type PersonSignalRow = {
  id: string;
  signal_type: string;
  detected_at: string;
  lead_id: string | null;
  signal_data: PersonSignalData;
};

function usePeoplePosts() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["people_posts", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const sb = createSupabaseBrowserClient();
      // Coarse DB cut on detection date, then a precise 30-day filter by
      // post date client-side (posted_at lives in signal_data jsonb).
      const cutoff = new Date(Date.now() - 45 * 86_400_000).toISOString();
      const { data, error } = await sb
        .from("signals")
        .select("id, signal_type, detected_at, lead_id, signal_data")
        .in("signal_type", [...PERSON_SIGNAL_TYPES])
        .gte("detected_at", cutoff)
        .order("detected_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as PersonSignalRow[];
    },
    staleTime: 10 * 60_000,
  });
}

type LeadMeta = {
  name: string | null;
  title: string | null;
  photo_url: string | null;
  linkedin_url: string | null;
};

function useLeadsForRows(rows: ReadonlyArray<PersonSignalRow>) {
  const { orgId } = useOrg();
  const ids = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r) => r.lead_id).filter((v): v is string => !!v)),
      ).sort(),
    [rows],
  );
  return useQuery({
    queryKey: ["people_posts_leads", orgId, ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const sb = createSupabaseBrowserClient();
      const { data, error } = await sb
        .from("leads")
        .select("id, first_name, last_name, title, photo_url, linkedin_url")
        .in("id", ids);
      if (error) throw error;
      const m = new Map<string, LeadMeta>();
      for (const l of (data ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        title: string | null;
        photo_url: string | null;
        linkedin_url: string | null;
      }>) {
        m.set(l.id, {
          name: [l.first_name, l.last_name].filter(Boolean).join(" ") || null,
          title: l.title,
          photo_url: l.photo_url,
          linkedin_url: l.linkedin_url,
        });
      }
      return m;
    },
    staleTime: 60_000,
  });
}

function contextFor(d: PersonSignalData): string | null {
  const who = d.original_post_author;
  if (d.kind === "comment") {
    return who ? `Commented on ${who}'s post` : "Commented on a post";
  }
  if (d.kind === "reaction") {
    return who ? `Reacted to ${who}'s post` : "Reacted to a post";
  }
  return null;
}

function bodyFor(d: PersonSignalData): string {
  // Their own comment is the interesting content when they commented;
  // otherwise the post they wrote or engaged with. NO headline fallback:
  // a summary is not a post, and rendering it inside post-card chrome
  // produced hollow cards.
  return (
    (d.kind === "comment" && d.comment_text) ||
    d.post_text ||
    d.quoted_excerpt ||
    ""
  );
}

function relativeShort(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const d = Math.round((Date.now() - new Date(value).getTime()) / 86_400_000);
    if (d < 1) return "today";
    return `${d}d`;
  } catch {
    return null;
  }
}

/** One-line summary for legacy signals that carry no post content —
 * "posted about ai, security" without repeating the person's name. */

const MAX_AGE_MS = 30 * 86_400_000;

/** A post older than 30 days is a dead opener — the moment's gone.
 * Filter by the real post date when we have it; legacy
 * signals without a post date keep their (recent) detection date. */
function withinWindow(row: PersonSignalRow): boolean {
  const stamp = row.signal_data?.posted_at || row.detected_at;
  if (!stamp) return true;
  const t = new Date(stamp).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t <= MAX_AGE_MS;
}

export function PeoplePosts() {
  const feed = usePeoplePosts();
  const rows = useMemo(
    () => {
      // Dedupe: the same LinkedIn post can arrive as two signal rows
      // (posted + engaged, or a re-scrape). One post, one card — keyed on
      // the post URL when stored, else the body text.
      const seen = new Set<string>();
      return (feed.data ?? []).filter(withinWindow).filter((row) => {
        const d = row.signal_data || {};
        const key = (d.url || d.source_url || bodyFor(d) || row.id)
          .toString()
          .trim()
          .toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    [feed.data],
  );
  const leads = useLeadsForRows(rows);

  return (
    <Card>
      <div className="p-5 pb-0">
      <SectionHeader title="From your people" />
      </div>
      {feed.isLoading ? (
        <div className="flex flex-col gap-3 px-5 pb-5">
          <Shimmer className="h-24 w-full" />
          <Shimmer className="h-24 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="px-5 pb-5 text-[13px] text-text-muted">
          Nothing from your watched people this week. Watch more people to
          fill this feed.
        </p>
      ) : (
        <ul className="mx-5 mb-5 flex max-h-[430px] flex-col gap-3 overflow-y-auto pb-6 pr-1 [scrollbar-width:thin] [mask-image:linear-gradient(to_bottom,black_calc(100%-36px),transparent)]">
          {rows.map((row) => {
            const d = row.signal_data || {};
            const body = bodyFor(d);
            const lead = row.lead_id ? leads.data?.get(row.lead_id) : undefined;
            const name = d.person_name || lead?.name || "Watched person";
            const title = d.person_title || lead?.title;
            const when = d.posted_at || row.detected_at;
            // No post content stored (legacy signal) — skip; a stub row
            // that says "posted something" with no post is noise.
            if (!body) return null;
            return (
              <li key={row.id}>
                <LinkedInPostCard
                  authorName={name}
                  authorTitle={title}
                  authorAvatarUrl={lead?.photo_url || null}
                  postedAt={when}
                  text={body}
                  engagement={d.engagement}
                  url={d.url || d.source_url || lead?.linkedin_url}
                  context={contextFor(d)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
