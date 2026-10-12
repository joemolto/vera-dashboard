"use client";

/**
 * Integrations — connect external destinations (Slack first) so Vera pushes
 * its intelligence into the tools a team already uses. Per-org, flag-gated on
 * features.integrations.
 *
 * Security: the provider secret (e.g. Slack incoming-webhook URL) lives in the
 * org_integrations.secret column and is NEVER selected into the browser. The
 * browser only ever reads the safe display columns below; the secret is written
 * by the OAuth callback (server) and read by the test/send routes (server).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useOrg } from "@/components/dashboard/OrgContext";

const sb = () => createSupabaseBrowserClient();

export interface Integration {
  id: string;
  provider: string;
  status: string;
  account_label: string | null;
  channel: string | null;
  /** Non-secret provider metadata (hub_id, channel_id, daily_brief …). */
  meta: Record<string, unknown> | null;
  created_at: string;
}

export function useIntegrations() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["integrations", orgId],
    queryFn: async () => {
      // Safe columns only — never select `secret`.
      const { data, error } = await sb()
        .from("org_integrations")
        .select("id, provider, status, account_label, channel, meta, created_at")
        .eq("org_id", orgId);
      if (error) throw error;
      return (data ?? []) as Integration[];
    },
  });
}

/** Flip the Slack daily brief on/off — merges into meta so the other
 * connection metadata survives. Default (key absent) means ON. */
export function useSetDailyBrief() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ row, enabled }: { row: Integration; enabled: boolean }) => {
      const { error } = await sb()
        .from("org_integrations")
        .update({ meta: { ...(row.meta ?? {}), daily_brief: enabled } })
        .eq("org_id", orgId)
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations", orgId] }),
  });
}

export function useDisconnectIntegration() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (provider: string) => {
      const { error } = await sb()
        .from("org_integrations")
        .delete()
        .eq("org_id", orgId)
        .eq("provider", provider);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations", orgId] }),
  });
}

/** Fire a test message to the connected Slack channel (server reads the secret). */
export function useSendSlackTest() {
  return useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/integrations/slack/test", { method: "POST" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) throw new Error(data.error || "send_failed");
      return data as { ok: true };
    },
  });
}
