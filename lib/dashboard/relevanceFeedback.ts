"use client";

/**
 * "Not relevant" feedback. Per-org (never mutates the shared companies row):
 * the displayed lists filter against it, and the dismissed titles become
 * training signal for a per-org negative ICP (engine aggregation, phase 2).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { EV, track } from "@/lib/analytics";
import { useOrg } from "@/components/dashboard/OrgContext";

const sb = () => createSupabaseBrowserClient();

/** Apollo ids the org has marked "not relevant" (contacts). */
export function useDismissedContacts() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["relevance_dismissed_contacts", orgId],
    queryFn: async () => {
      const { data, error } = await sb()
        .from("relevance_feedback")
        .select("entity_ref")
        .eq("org_id", orgId)
        .eq("entity_type", "contact");
      if (error) throw error;
      return new Set(
        (data ?? [])
          .map((r) => (r as { entity_ref: string | null }).entity_ref)
          .filter((v): v is string => !!v),
      );
    },
    staleTime: 60_000,
  });
}

export interface DismissContactInput {
  apolloId: string;
  name?: string | null;
  title?: string | null;
  domain?: string | null;
  surface?: string;
}

export function useDismissContact() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const key = ["relevance_dismissed_contacts", orgId];
  return useMutation({
    mutationFn: async (c: DismissContactInput) => {
      const { error } = await sb()
        .from("relevance_feedback")
        .upsert(
          {
            org_id: orgId,
            entity_type: "contact",
            entity_ref: c.apolloId,
            company_domain: c.domain ?? null,
            label: c.name ?? null,
            title: c.title ?? null,
            surface: c.surface ?? "account_people",
            reason: "not_relevant",
          },
          { onConflict: "org_id,entity_type,entity_ref", ignoreDuplicates: true },
        );
      if (error) throw error;
      track(EV.contactDismissed, { surface: c.surface ?? "account_people" });
    },
    // Optimistically add to the dismissed set so the card disappears at once.
    onMutate: async (c) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Set<string>>(key);
      const next = new Set(prev ?? []);
      next.add(c.apolloId);
      qc.setQueryData(key, next);
      return { prev };
    },
    onError: (_e, _c, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
