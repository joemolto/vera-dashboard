"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { EV, track } from "@/lib/analytics";
import { useOrg } from "@/components/dashboard/OrgContext";
import type {
  Lead,
  Signal,
  ScoredSignal,
  ThreatAlert,
  ThreatIntel,
  WatchlistCompany,
  WatchlistAlert,
  ActivityEntry,
  Organisation,
  UsageStatus,
} from "./types";
import { claraApi } from "./claraApi";
import { defaultCurrency } from "@/lib/dashboard/revenue";
import { dropHiddenSignals, hiddenSignalTypes } from "@/lib/dashboard/buyingTriggers";

const sb = () => createSupabaseBrowserClient();

export function useLeads() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["leads", orgId],
    queryFn: async () => {
      const { data, error } = await sb()
        .from("leads")
        .select(
          "id, org_id, email, phone, first_name, last_name, title, company_name, company_domain, company_size, company_industry, company_location, linkedin_url, photo_url, total_score, signal_score, icp_score, signal_count, status, lead_rating, enrichment_status, recommended_action, best_approach_angle, rating_reason, signals, buying_signals, source, suggestion_reason, created_at, updated_at, scored_at, enriched_at, first_hot_at, outreach_at, revenue_potential, signal_summary, company_revenue, person_monitoring",
        )
        .eq("org_id", orgId)
        .not("status", "in", "(archived,deleted)")
        .order("total_score", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });
}

/**
 * Leads for a single account's domain — the light query an account page needs
 * (security contact, same-company peers) instead of pulling the whole book.
 * Only the columns the callers actually read.
 */
export function useAccountLeads(domain: string | undefined) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["account_leads", orgId, (domain ?? "").toLowerCase()],
    enabled: !!orgId && !!domain,
    queryFn: async () => {
      const { data, error } = await sb()
        .from("leads")
        .select(
          "id, first_name, last_name, title, email, linkedin_url, company_domain, total_score",
        )
        .eq("org_id", orgId)
        .ilike("company_domain", domain!)
        .not("status", "in", "(archived,deleted)");
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
    staleTime: 2 * 60_000,
  });
}

/**
 * Mark a lead as reached-out. Optimistically removes it from the
 * "Act on today" queue (the feed filters on outreach_at) and refreshes
 * the metric strip. Manual until Gmail/Outlook send integration lands.
 */
export function useMarkReachedOut() {
  const { orgId } = useOrg();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (leadId: string) => {
      return await claraApi(`/leads/${leadId}/mark-reached-out`, {
        method: "POST",
        body: JSON.stringify({ org_id: orgId }),
      });
    },
    onMutate: async (leadId: string) => {
      await queryClient.cancelQueries({ queryKey: ["leads", orgId] });
      const prev = queryClient.getQueryData<Lead[]>(["leads", orgId]);
      // Optimistic: stamp outreach_at locally so the lead drops out of
      // Act-on-today immediately and the metric updates without a wait.
      queryClient.setQueryData<Lead[]>(["leads", orgId], (old) =>
        (old ?? []).map((l) =>
          l.id === leadId
            ? { ...l, outreach_at: new Date().toISOString(), status: "contacted" }
            : l,
        ),
      );
      return { prev };
    },
    onError: (_e, _leadId, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["leads", orgId], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["leads", orgId] });
    },
  });
}

export function useLead(id: string | undefined) {
  const { orgId } = useOrg();
  return useQuery({
    // orgId in the key so a cached entry from another org can't bleed
    // through if a user opens the same lead URL after switching orgs.
    // The DB query also filters on org_id; this is the cache-layer
    // belt-and-braces.
    queryKey: ["lead", orgId, id],
    queryFn: async () => {
      const { data, error } = await sb()
        .from("leads")
        .select("*")
        .eq("id", id!)
        .eq("org_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return data as Lead | null;
    },
    enabled: !!id && !!orgId,
  });
}

export function useLeadSignals(leadId: string | undefined) {
  const { orgId } = useOrg();
  return useQuery({
    // orgId in the key + org_id filter on the query — same defence-in-
    // depth as useLead, so a cached signal list from another org can't
    // briefly render when the user switches orgs.
    queryKey: ["lead_signals", orgId, leadId],
    queryFn: async () => {
      const { data, error } = await sb()
        .from("signals")
        .select(
          "id, org_id, lead_id, signal_type, signal_source, signal_data, signal_strength, detected_at",
        )
        .eq("lead_id", leadId!)
        .eq("org_id", orgId)
        .order("detected_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Signal[];
    },
    enabled: !!leadId && !!orgId,
  });
}

export function useSignals() {
  const { orgId, signalPriorities } = useOrg();
  // Weight 0 = never shown to this org (see hiddenSignalTypes). Filtering
  // here sweeps every raw-signals surface at once — home timeline, HomeV2
  // cards, stat bundles, analytics, Vera brief, who-to-contact.
  const hidden = hiddenSignalTypes(signalPriorities);
  return useQuery({
    queryKey: ["signals", orgId, hidden.size],
    queryFn: async () => {
      const { data, error } = await sb()
        .from("signals")
        .select(
          "id, org_id, lead_id, company_id, signal_type, signal_source, signal_data, signal_strength, detected_at",
        )
        .eq("org_id", orgId)
        .order("detected_at", { ascending: false });
      if (error) throw error;
      return dropHiddenSignals((data ?? []) as Signal[], hidden);
    },
  });
}

/** Aggregated relevance score per watchlist account (domain). Backed
 * by `get_account_scores` Postgres RPC — same scoring spine as
 * useScoredSignals, summed per domain. Returns empty when the org
 * has no priorities; callers should gate on features.signal_ranking. */
export function useAccountScores(opts: { sinceDays?: number } = {}) {
  const { orgId, features } = useOrg();
  const sinceDays = opts.sinceDays ?? 30;
  return useQuery({
    queryKey: ["account_scores", orgId, sinceDays],
    enabled: !!orgId && !!features.signal_ranking,
    queryFn: async () => {
      const since = new Date(Date.now() - sinceDays * 86400 * 1000).toISOString();
      const { data, error } = await sb().rpc("get_account_scores", {
        p_org_id: orgId,
        p_since: since,
      });
      if (error) throw error;
      const map = new Map<string, { score: number; signalCount: number }>();
      for (const row of (data ?? []) as Array<{
        domain: string;
        account_score: string | number;
        signal_count: number;
      }>) {
        if (!row.domain) continue;
        map.set(row.domain.toLowerCase(), {
          score: Number(row.account_score),
          signalCount: row.signal_count,
        });
      }
      return map;
    },
  });
}

/** Relevance-scored signals for the current org. Backed by the
 * `get_scored_signals` Postgres RPC, which joins to leads for icp_score
 * (account fit) and computes per-row score = weight × strength × decay
 * × fit. Returns an empty array when the org has no
 * icp_config.signal_priorities — callers should pair this with
 * features.signal_ranking to know whether to use scored output or
 * fall back to the global whitelist path. Sorted by vera_score DESC
 * server-side; caller does not need to re-sort. */
export function useScoredSignals(opts: { sinceDays?: number } = {}) {
  const { orgId, features } = useOrg();
  const sinceDays = opts.sinceDays ?? 7;
  return useQuery({
    queryKey: ["scored_signals", orgId, sinceDays],
    enabled: !!orgId && !!features.signal_ranking,
    queryFn: async () => {
      const since = new Date(Date.now() - sinceDays * 86400 * 1000).toISOString();
      const { data, error } = await sb().rpc("get_scored_signals", {
        p_org_id: orgId,
        p_since: since,
      });
      if (error) throw error;
      return (data ?? []) as ScoredSignal[];
    },
  });
}

export function useThreatAlerts() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["threat_alerts", orgId],
    queryFn: async () => {
      const { data, error } = await sb()
        .from("threat_alerts")
        .select(
          "id, org_id, threat_intel_id, relevance_reason, sales_angle, suggested_outreach, content_hook, urgency, status, detected_at, seen_at, actioned_at, threat_intel:threat_intel_id (id, title, description, severity, url, published_at, source, ai_summary, affected_industries, affected_technologies, affected_vendors)",
        )
        .eq("org_id", orgId)
        .order("detected_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ThreatAlert[];
    },
  });
}

export function useThreatIntel() {
  return useQuery({
    queryKey: ["threat_intel"],
    queryFn: async () => {
      const { data, error } = await sb()
        .from("threat_intel")
        .select(
          "id, source, source_id, title, description, severity, url, published_at, ai_summary, affected_industries, affected_technologies, affected_vendors, fetched_at",
        )
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ThreatIntel[];
    },
  });
}

/** Remove a watched/researched account (e.g. an accidental research). Never
 *  refunds the monthly research allowance; the engine stops monitoring, freeing
 *  the standing watched slot. Hidden from the dashboard immediately after.
 *  (Distinct from useDeleteAccount, which closes the whole org account.) */
export function useRemoveAccount() {
  const { orgId } = useOrg();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (domain: string) =>
      claraApi("/accounts/delete", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId, domain }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist", orgId] });
      queryClient.invalidateQueries({ queryKey: ["account_scores", orgId] });
      queryClient.invalidateQueries({ queryKey: ["solo_limits", orgId] });
    },
  });
}

/** Soft-delete a person (lead). Keeps the row so an already-spent unlock is
 *  never refunded; frees the watched-people slot. */
export function useDeletePerson() {
  const { orgId } = useOrg();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (leadId: string) =>
      claraApi("/accounts/people/delete", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId, lead_id: leadId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads", orgId] });
      queryClient.invalidateQueries({ queryKey: ["solo_limits", orgId] });
    },
  });
}

export function useWatchlist() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["watchlist", orgId],
    queryFn: async () => {
      // Filter to active only — pending suggestions live in the same
      // table but are surfaced via useAccountSuggestions (separate
      // tray on the accounts page). Dismissed rows never re-surface.
      // The "in" with active+null also covers legacy rows that
      // existed before the migration backfilled the column.
      const { data, error } = await sb()
        .from("watchlist")
        .select(
          "id, org_id, company_name, company_domain, target_contact_name, target_contact_title, target_contact_linkedin, notes, priority, monitoring_active, last_monitored_at, next_monitor_at, lead_id, created_at, market_id",
        )
        .eq("org_id", orgId)
        .eq("status", "active")
        .order("priority", { ascending: false })
        .order("company_name");
      if (error) throw error;
      return (data ?? []) as WatchlistCompany[];
    },
  });
}

/** Pending suggestions for the "Suggested accounts" tray. Pilot;
 * other orgs get an empty list because the engine /topup endpoint
 * only inserts rows when icp_config.features.account_suggestions is
 * true. Gated by features.account_suggestions on the client side too
 * — the tray is rendered only when the flag is on. */
export interface AccountSuggestion {
  id: string;
  company_name: string;
  company_domain: string;
  suggested_reasons: string[] | null;
  created_at: string | null;
}

export function useAccountSuggestions() {
  const { orgId, features } = useOrg();
  return useQuery({
    queryKey: ["account_suggestions", orgId],
    enabled: !!orgId && !!features.account_suggestions,
    queryFn: async () => {
      const { data, error } = await sb()
        .from("watchlist")
        .select("id, company_name, company_domain, suggested_reasons, created_at")
        .eq("org_id", orgId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as AccountSuggestion[];
    },
  });
}

export type PersonIntelMode = "off" | "top1" | "deep";

/** Read the person_intel_enabled state + cached key_contacts for one
 * account. Drives the People tab toggle and the contacts preview. */
export function useAccountPersonIntel(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["account_person_intel", companyId],
    enabled: !!companyId,
    // Poll every 5s while person-intel is enabled but key_contacts
    // hasn't populated yet. The engine endpoint
    // kicks discovery as a background task on toggle-on; contacts
    // typically appear within 5-30s. Stop polling once we have any
    // contacts. Also stop polling when mode is "off" so we don't
    // hammer the DB on accounts with the feature disabled.
    refetchInterval: (query) => {
      const data = query.state.data as {
        person_intel_enabled: PersonIntelMode | null;
        key_contacts: unknown[] | null;
      } | null | undefined;
      const mode = data?.person_intel_enabled ?? "off";
      const haveContacts = (data?.key_contacts?.length ?? 0) > 0;
      if (mode !== "off" && !haveContacts) return 5000;
      return false;
    },
    queryFn: async () => {
      const { data, error } = await sb()
        .from("companies")
        .select(
          "id, person_intel_enabled, key_contacts, key_contacts_refreshed_at, last_person_intel_at",
        )
        .eq("id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        person_intel_enabled: PersonIntelMode | null;
        key_contacts:
          | Array<{
              name: string;
              title: string;
              linkedin_url: string;
              icp_score?: number;
            }>
          | null;
        key_contacts_refreshed_at: string | null;
        last_person_intel_at: string | null;
      } | null;
    },
  });
}

/** Flip person_intel_enabled on a watched account. Hits the engine so
 * the change is server-validated (verifies the account belongs to the
 * caller's org). Invalidates the per-account intel query so the UI
 * updates without a full refetch. */
export function useSetPersonIntel() {
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  return useMutation({
    mutationFn: async ({
      companyId,
      mode,
    }: {
      companyId: string;
      mode: PersonIntelMode;
    }) => {
      return await claraApi(`/accounts/${companyId}/person-intel`, {
        method: "POST",
        body: JSON.stringify({ org_id: orgId, mode }),
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["account_person_intel", variables.companyId],
      });
    },
  });
}

/** Unlock one contact at an account via Apollo people-match (1 credit).
 * Reveals email + phone + full name, creates a leads row, returns the
 * new lead_id so the caller can navigate to /dashboard/prospects/[id].
 *
 * Surfaces the contact-revealing UX that the
 * legacy accounts drawer hinted at ("Unlock contact details on the
 * account page") and ties it to the existing lead-page enrichment.
 *
 * Slide-to-confirm should ALWAYS gate the call site — this mutation
 * does not gate itself.
 */
export function useUnlockContact() {
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  return useMutation({
    mutationFn: async ({
      companyId,
      apolloId,
      // Optional person hints — when the contact came from a live Apollo
      // search (not yet in companies.key_contacts), these let the engine
      // match + unlock + append it instead of 404ing on an unknown apollo_id.
      firstName,
      lastName,
      name,
      title,
      linkedinUrl,
    }: {
      companyId: string;
      apolloId: string;
      firstName?: string;
      lastName?: string;
      name?: string;
      title?: string;
      linkedinUrl?: string;
    }) => {
      return (await claraApi(
        `/accounts/${companyId}/people/${encodeURIComponent(apolloId)}/unlock`,
        {
          method: "POST",
          body: JSON.stringify({
            org_id: orgId,
            first_name: firstName,
            last_name: lastName,
            name,
            title,
            linkedin_url: linkedinUrl,
          }),
        },
      )) as {
        ok: boolean;
        lead_id: string;
        already_unlocked: boolean;
      };
    },
    onSuccess: (_data, variables) => {
      track(EV.contactUnlocked);
      // Refresh every surface that reflects the unlock: the per-account
      // contacts list, the org's unlock records, the live people drawer,
      // the org leads list, and the accounts-table data.
      queryClient.invalidateQueries({ queryKey: ["account_person_intel", variables.companyId] });
      queryClient.invalidateQueries({ queryKey: ["my_unlocks", orgId] });
      queryClient.invalidateQueries({ queryKey: ["apollo_people", orgId] });
      queryClient.invalidateQueries({ queryKey: ["leads", orgId] });
      queryClient.invalidateQueries({ queryKey: ["companies_by_domain"] });
      queryClient.invalidateQueries({ queryKey: ["watchlist", orgId] });
    },
  });
}

/** One unlock record from apollo_people_cache — the org-scoped source of
 * truth for "we revealed this person". Never derived from
 * companies.key_contacts: that row is GLOBAL (shared by every org watching
 * the domain), so unlock state stored there leaked one org's paid reveals
 * to other orgs (fixed 2026-07-09). */
export interface UnlockRecord {
  apollo_id: string;
  lead_id: string | null;
  company_domain: string | null;
  email: string | null;
}

/** All of THIS org's unlocked contacts, keyed for merge-by-apollo_id.
 * RLS scopes reads to the caller's org; the explicit org filter is
 * belt-and-braces per the tenant-isolation rule. Small result set (bounded
 * by the org's lifetime unlock count), so one query serves both the People
 * tab and the accounts-table Key Contact column. */
export function useMyUnlocks() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["my_unlocks", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await sb()
        .from("apollo_people_cache")
        .select("apollo_id, lead_id, company_domain, person_data")
        .eq("org_id", orgId);
      if (error) throw error;
      return ((data ?? []) as Array<{
        apollo_id: string;
        lead_id: string | null;
        company_domain: string | null;
        person_data: { email?: string | null } | null;
      }>).map((r) => ({
        apollo_id: String(r.apollo_id),
        lead_id: r.lead_id ?? null,
        company_domain: r.company_domain ?? null,
        email: r.person_data?.email ?? null,
      })) as UnlockRecord[];
    },
  });
}

/**
 * Start or stop WATCHING a specific person (a lead). Watching runs Vera's
 * weekly person monitor on them — role change, posts, competitor
 * engagement → person signals — independent of whether their company is a
 * watched account. Free action (no per-use charge); bounded by the Solo
 * "People watched" standing cap, so the call site should respect that cap.
 *
 * Slide-to-confirm should gate turning watch ON at the call site — this
 * mutation does not gate itself.
 */
export function useWatchPerson() {
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  return useMutation({
    mutationFn: async ({
      leadId,
      active,
    }: {
      leadId: string;
      active: boolean;
    }) => {
      return (await claraApi("/accounts/people/monitoring", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId, lead_id: leadId, active }),
      })) as { ok: boolean; lead_id: string; person_monitoring: boolean };
    },
    onSuccess: (data) => {
      if (data?.person_monitoring) track(EV.personWatched);
      // Refresh the leads list (PeopleView watched state) + the Solo cap
      // chrome (People watched count).
      queryClient.invalidateQueries({ queryKey: ["leads", orgId] });
      queryClient.invalidateQueries({ queryKey: ["solo_limits", orgId] });
    },
  });
}

export interface UnlockedLead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  title: string | null;
  enrichment_status: string | null;
  created_at: string;
}

export interface SoloLimits {
  tier: string;
  capacity_packs: number;
  max_capacity_packs: number;
  pack_accounts: number;
  /** Per-pack increments for the other levers (added 2026-06-19 so packs
   *  scale contacts too). Optional for backwards-compat with cached payloads. */
  pack_watched?: number;
  pack_unlocks?: number;
  pack_person_intel?: number;
  /** Per-pack increment for the "People watched" lever (added 2026-06-19). */
  pack_monitored_people?: number;
  limits: {
    accounts: number;
    watched: number;
    person_intel_accounts: number;
    /** Optional until the engine that returns it is deployed. */
    monitored_people?: number;
    unlocks_per_month: number;
  };
  usage: {
    accounts: number;
    watched: number;
    person_intel_accounts: number;
    monitored_people?: number;
    unlocks_this_month: number;
  };
  remaining: {
    accounts: number;
    watched: number;
    person_intel_accounts: number;
    monitored_people?: number;
    unlocks_this_month: number;
  };
}

/** Switch the Solo subscription to a capacity tier (0-3). Stripe
 * prorates; the cap updates once the org's capacity_packs syncs. */
export function useSoloCapacity() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (packs: number) =>
      claraApi("/billing/solo/capacity", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId, packs }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["solo_limits", orgId] });
    },
  });
}

/** Permanently delete the org + all data + the user's login (GDPR erasure).
 * Irreversible — distinct from cancelling, which keeps the data. */
export function useDeleteAccount() {
  const { orgId } = useOrg();
  return useMutation({
    mutationFn: async () =>
      claraApi("/billing/delete-account", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId }),
      }),
  });
}

/** Usage + caps for a Vera Solo org. Drives the cap chrome (accounts
 * used, unlocks left this month). Only fetched when the org is on the
 * Solo plan. */
export function useSoloLimits(enabled: boolean) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["solo_limits", orgId],
    enabled: enabled && !!orgId,
    staleTime: 30_000,
    queryFn: async () => {
      return (await claraApi("/accounts/solo/limits", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId }),
      })) as SoloLimits;
    },
  });
}

export interface AccountPotential {
  estimated_revenue_potential: number | null;
  range_low: number | null;
  range_high: number | null;
  currency: string;
  confidence: string;
  deal_size_band: string;
  why_this_value: string[];
  recommended_commercial_angle?: string;
}

/** Deterministic per-account deal-potential estimate (org baseline ×
 * size/revenue/industry/signal multipliers). Computed on read by the
 * engine. Returns a null estimate when the org has no average deal size
 * configured — callers render nothing in that case. */
export function useAccountPotential(domain: string) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["account_potential", orgId, domain],
    enabled: !!orgId && !!domain,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      return (await claraApi("/accounts/potential", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId, domain }),
      })) as AccountPotential;
    },
  });
}

/** True once the engine's background enrichment has finished with this
 * lead (successfully or by filtering it). Unlock-created leads start
 * with enrichment_status NULL and flip to "enriched" ~1-2 min later. */
export function isLeadEnrichmentSettled(lead: UnlockedLead): boolean {
  return ["enriched", "filtered", "excluded"].includes(
    lead.enrichment_status ?? "",
  );
}

/** Fetch the leads behind unlocked contacts so the People tab can show
 * the enriched record (full name, email) inline. Polls every 5s while
 * any lead is still enriching; gives up on leads older than 15 minutes
 * so a failed enrichment doesn't poll forever. */
export function useUnlockedLeads(leadIds: string[]) {
  const { orgId } = useOrg();
  const key = [...leadIds].sort().join("|");
  return useQuery({
    queryKey: ["unlocked_leads", orgId, key],
    enabled: !!orgId && leadIds.length > 0,
    refetchInterval: (query) => {
      const data = query.state.data as UnlockedLead[] | undefined;
      if (!data) return 5000;
      const stillEnriching = data.some(
        (l) =>
          !isLeadEnrichmentSettled(l) &&
          Date.now() - new Date(l.created_at).getTime() < 15 * 60_000,
      );
      return stillEnriching ? 5000 : false;
    },
    queryFn: async () => {
      const { data, error } = await sb()
        .from("leads")
        .select(
          "id, first_name, last_name, email, title, enrichment_status, created_at",
        )
        .eq("org_id", orgId)
        .in("id", leadIds);
      if (error) throw error;
      return (data ?? []) as UnlockedLead[];
    },
  });
}

/** Pause or resume weekly monitoring for one watched account. When
 * paused the batch monitor skips it and no monitor-pass credits are
 * spent. Invalidates the watchlist so the row reflects the new state. */
export function useSetMonitoring() {
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  return useMutation({
    mutationFn: async ({
      watchlistId,
      active,
    }: {
      watchlistId: string;
      active: boolean;
    }) => {
      return await claraApi(`/accounts/monitoring`, {
        method: "POST",
        body: JSON.stringify({
          org_id: orgId,
          watchlist_id: watchlistId,
          active,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist", orgId] });
    },
  });
}

/** Mutation hook for accept/dismiss. Hits the engine endpoints so the
 * background top-up fires. Invalidates both account_suggestions (tray
 * refresh) and watchlist (accept = new active account). */
export function useSuggestionAction() {
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  return useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string;
      action: "accept" | "dismiss";
    }) => {
      // org_id is required by the engine — the update is scoped to it
      // so a suggestion id alone can never touch another org's rows.
      return await claraApi(`/accounts/suggestions/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ org_id: orgId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account_suggestions", orgId] });
      queryClient.invalidateQueries({ queryKey: ["watchlist", orgId] });
    },
  });
}

/** Per-action credit usage in a window, with running total + breakdown by
 * action type. Used by AnalyticsV2 to answer "where did my credits go".
 * Each entry: { action, units_total, count }. Pulls raw rows from
 * credit_ledger and aggregates client-side — keeps the query simple
 * (no new RPC) and the table is small enough that even a year of
 * activity is sub-second. */
export interface CreditLedgerSummary {
  total_units: number;
  by_action: Array<{ action: string; units: number; count: number }>;
  daily_burn: Array<{ date: string; units: number }>;
}

export function useCreditUsage(opts: { sinceDays?: number } = {}) {
  const { orgId } = useOrg();
  const sinceDays = opts.sinceDays ?? 30;
  return useQuery({
    queryKey: ["credit_usage", orgId, sinceDays],
    enabled: !!orgId,
    queryFn: async (): Promise<CreditLedgerSummary> => {
      const since = new Date(Date.now() - sinceDays * 86400 * 1000).toISOString();
      const { data, error } = await sb()
        .from("credit_ledger")
        .select("action, units, created_at")
        .eq("org_id", orgId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;

      const rows = (data ?? []) as Array<{
        action: string;
        units: number;
        created_at: string;
      }>;

      const byAction = new Map<string, { units: number; count: number }>();
      const byDay = new Map<string, number>();
      let total = 0;
      for (const r of rows) {
        total += r.units;
        const a = r.action || "unknown";
        const prev = byAction.get(a) ?? { units: 0, count: 0 };
        prev.units += r.units;
        prev.count += 1;
        byAction.set(a, prev);

        const day = r.created_at.slice(0, 10);
        byDay.set(day, (byDay.get(day) ?? 0) + r.units);
      }

      return {
        total_units: total,
        by_action: Array.from(byAction.entries())
          .map(([action, v]) => ({ action, units: v.units, count: v.count }))
          .sort((a, b) => b.units - a.units),
        daily_burn: Array.from(byDay.entries())
          .map(([date, units]) => ({ date, units }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      };
    },
  });
}

export function useWatchlistAlerts() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["watchlist_alerts", orgId],
    queryFn: async () => {
      const { data, error } = await sb()
        .from("watchlist_alerts")
        .select(
          "id, org_id, watchlist_id, alert_type, alert_title, alert_summary, suggested_action, approach_angle, urgency, status, detected_at",
        )
        .eq("org_id", orgId)
        .order("detected_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WatchlistAlert[];
    },
  });
}

export function useActivity(limit = 25) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["activity", orgId, limit],
    queryFn: async () => {
      const { data, error } = await sb()
        .from("activity_log")
        .select("id, org_id, lead_id, activity_type, activity_data, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as ActivityEntry[];
    },
  });
}

export function useUsage() {
  const { orgId } = useOrg();
  return useQuery<UsageStatus>({
    queryKey: ["usage", orgId],
    queryFn: async () => {
      try {
        return await claraApi<UsageStatus>(
          `/usage/status?org_id=${orgId}`,
          {},
          15_000,
        );
      } catch {
        const month = new Date().toISOString().slice(0, 7);
        const resets = new Date(
          new Date().getFullYear(),
          new Date().getMonth() + 1,
          1,
        )
          .toISOString()
          .slice(0, 10);
        return {
          tier: "scout",
          month,
          enrichments_used: 0,
          enrichments_limit: 100,
          remaining: 100,
          pct_used: 0,
          resets_on: resets,
        };
      }
    },
    retry: false,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });
}

export function useOrganisation() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["organisation", orgId],
    queryFn: async () => {
      const { data, error } = await sb()
        .from("organisations")
        .select(
          "id, name, domain, industry, tier, subscription_tier, monthly_enrichment_limit, created_at",
        )
        .eq("id", orgId)
        .maybeSingle();
      if (error) throw error;
      return data as Organisation | null;
    },
  });
}

// --------------------------------------------------------------------------
// Buyer profiles (ICP personas) — Settings page
// --------------------------------------------------------------------------

export interface IcpPersona {
  id: string;
  name: string;
  active: boolean;
  target_titles: string[];
  target_seniorities: string[];
  target_industries: string[];
  target_locations: string[];
  target_company_size: string[];
  target_revenue_range: string | null;
  target_funding_stages: string[];
  target_tech_uses: string[];
  target_tech_excludes: string[];
}

export interface IcpVocabBracket {
  value: string;
  label: string;
}

export interface IcpVocabTech {
  value: string;
  label: string;
  category: string;
}

export interface IcpVocabularies {
  seniorities: IcpVocabBracket[];
  funding_stages: IcpVocabBracket[];
  company_sizes: IcpVocabBracket[];
  revenue_brackets: IcpVocabBracket[];
  technologies: IcpVocabTech[];
}

export interface IcpPersonasResponse {
  personas: IcpPersona[];
  tier: string;
  limit: number;
  used: number;
}

export function useIcpPersonas() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["icp-personas", orgId],
    queryFn: async () => {
      return await claraApi<IcpPersonasResponse>(
        `/icp/personas?org_id=${orgId}`,
        { method: "GET" },
      );
    },
    staleTime: 30_000,
  });
}

// --------------------------------------------------------------------------
// Brain mode — per-org agent autonomy control
// --------------------------------------------------------------------------

export type BrainMode = "auto" | "surface_only" | "off";

export function useBrainMode() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["brain-mode", orgId],
    queryFn: async () => {
      const resp = await claraApi<{ brain_mode: BrainMode }>(
        `/icp/brain-mode?org_id=${orgId}`,
        { method: "GET" },
      );
      return resp.brain_mode;
    },
    staleTime: 60_000,
  });
}

// --------------------------------------------------------------------------
// Recent digest — LLM-cleaned "what's happened recently" feed
// --------------------------------------------------------------------------

export type RecentDigestKind =
  | "hot_lead"
  | "watchlist_news"
  | "threat"
  | "leadership_change"
  | "signal_event"
  | "other";

export interface RecentDigestSnippet {
  title: string;
  summary: string;
  kind?: RecentDigestKind;
  entity?: string;
  source?: string;
  related_count?: number;
  ts?: string;
}

export interface RecentDigestResponse {
  snippets: RecentDigestSnippet[];
  cached: boolean;
  generated_at: string | null;
}

export function useRecentDigest() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["recent-digest", orgId],
    queryFn: async () => {
      return await claraApi<RecentDigestResponse>(
        `/dashboard/recent-digest/${orgId}`,
        { method: "GET" },
        30_000,
      );
    },
    // Engine caches with a 15-min TTL — match it on the client so we don't
    // refetch unnecessarily, but stale-while-revalidate on focus.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

// Company intelligence (cross-client view of one company).
//
// The engine endpoint returns:
//   company        — global companies row (or null if not yet upserted)
//   signals        — company_intel rows ordered by latest_observed_at desc
//   threats        — company_threat_surface rows with joined threat_intel
//   anonymized_watcher_count — N other clients watching this company

export interface CompanyRecord {
  id: string;
  domain: string;
  name: string | null;
  industry: string | null;
  // Actual DB columns (companies table):
  hq_country: string | null;
  hq_city: string | null;
  size_band: string | null;  // e.g. "40" or "1001-5000"
  founded_year: number | null;
  linkedin_url: string | null;
  description: string | null;
  technologies: unknown[];   // array of {name, source, category, ...}
  last_enriched_at: string | null;
  // Optional rollup fields — present on some responses (e.g. /dashboard
  // company endpoint may compute them; absent on a raw row select). Keep
  // optional so callers don't crash on either shape.
  has_security_team_growth?: boolean;
  has_recent_funding?: boolean;
  has_compliance_signal?: boolean;
  enrichment_count?: number;
  watched_by_org_count?: number;
}

export interface CompanyIntelRow {
  signal_type: string;
  signal_data: Record<string, unknown>;
  source: string;
  first_observed_at: string;
  latest_observed_at: string;
  observed_count: number;
}

export interface CompanyThreatSurfaceRow {
  relevance_score: number | null;
  matched_via: string | null;
  first_observed_at: string;
  org_alert_count: number;
  threat_intel: {
    id: string;
    source: string;
    source_id: string;
    title: string;
    description: string | null;
    severity: string | null;
    url: string | null;
    published_at: string | null;
  } | null;
}

export interface CompanyIntelligence {
  company: CompanyRecord | null;
  signals: CompanyIntelRow[];
  threats: CompanyThreatSurfaceRow[];
  anonymized_watcher_count: number;
}

export function useCompanyIntelligence(domain: string | undefined) {
  const { orgId } = useOrg();
  return useQuery<CompanyIntelligence>({
    queryKey: ["company", orgId, domain],
    queryFn: async () => {
      return await claraApi<CompanyIntelligence>(
        `/dashboard/${orgId}/company/${encodeURIComponent(
          (domain ?? "").toLowerCase(),
        )}`,
        { method: "GET" },
      );
    },
    enabled: !!orgId && !!domain,
    staleTime: 60_000,
  });
}

export interface CompanyPerson {
  apollo_id: string | null;
  first_name: string;
  last_name: string;
  title: string;
  seniority: string;
  linkedin_url: string;
  country: string;
  city: string;
  state: string;
  headline: string;
  departments: string[];
  company_name: string;
}

export interface CompanyPeopleResponse {
  domain: string;
  people: CompanyPerson[];
  total: number;
}

// ---------------------------------------------------------------------------
// Credit accounting (Phase 3). Reads org_credits + credit_ledger directly via
// Supabase RLS so we don't need a new backend endpoint.
// ---------------------------------------------------------------------------

export interface CreditsBalance {
  month: string;
  included: number;
  purchased: number;
  used: number;
  remaining: number;
  pct_used: number;
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function useCreditsMeter() {
  const { orgId } = useOrg();
  return useQuery<CreditsBalance>({
    queryKey: ["credits_meter", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const month = currentMonthKey();
      const { data, error } = await sb()
        .from("org_credits")
        .select("month,included,purchased,used")
        .eq("org_id", orgId)
        .eq("month", month)
        .maybeSingle();
      if (error) throw error;
      const included = Number(data?.included ?? 0);
      const purchased = Number(data?.purchased ?? 0);
      const used = Number(data?.used ?? 0);
      const total = included + purchased;
      return {
        month,
        included,
        purchased,
        used,
        remaining: total - used,
        pct_used: total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0,
      };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export interface CreditLedgerRow {
  id: string;
  action: string;
  units: number;
  related_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function useCreditLedger(limit = 50) {
  const { orgId } = useOrg();
  return useQuery<CreditLedgerRow[]>({
    queryKey: ["credit_ledger", orgId, limit],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await sb()
        .from("credit_ledger")
        .select("id, action, units, related_id, metadata, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as CreditLedgerRow[];
    },
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Deal baseline — reads client_context.average_deal_size + currency +
// high_value_segments off the org. Drives the per-account revenue
// potential column. Returns nulls when not configured (caller hides the
// column).
// ---------------------------------------------------------------------------

export interface DealBaseline {
  averageDealSize: number | null;
  currency: string;
  highValueSegments: string[];
  lowValueSegments: string[];
  enterpriseThresholdEmployees: number | null;
  minDeal: number | null;
  maxDeal: number | null;
}

export function useDealBaseline() {
  const { orgId } = useOrg();
  return useQuery<DealBaseline>({
    queryKey: ["deal_baseline", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await sb()
        .from("organisations")
        .select("client_context, icp_config")
        .eq("id", orgId)
        .maybeSingle();
      if (error) throw error;
      const cc = (data?.client_context ?? {}) as Record<string, unknown>;
      const icp = (data?.icp_config ?? {}) as Record<string, unknown>;
      const locations = Array.isArray(icp.target_locations)
        ? (icp.target_locations as unknown[]).filter(
            (s): s is string => typeof s === "string",
          )
        : [];
      const num = (k: string): number | null => {
        const v = cc[k];
        if (v == null || v === "") return null;
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : null;
      };
      const list = (k: string): string[] => {
        const v = cc[k];
        if (Array.isArray(v)) return v.filter((s) => typeof s === "string");
        if (typeof v === "string")
          return v.split(",").map((s) => s.trim()).filter(Boolean);
        return [];
      };
      return {
        averageDealSize: num("average_deal_size"),
        currency: (cc.currency as string) || defaultCurrency(locations),
        highValueSegments: list("high_value_segments"),
        lowValueSegments: list("low_value_segments"),
        enterpriseThresholdEmployees: num("enterprise_threshold_employee_count"),
        minDeal: num("min_deal_size"),
        maxDeal: num("max_deal_size"),
      };
    },
    staleTime: 5 * 60_000,
  });
}

/** Suggested accounts — Apollo company search filtered by the org's ICP
 * (industries, locations, employee range) with already-watched domains
 * excluded. Powers the row at the bottom of /dashboard/accounts. Each
 * suggestion is a lightweight preview (name + domain + size + industry);
 * the user clicks through to the account page to trigger enrichment.
 *
 * Cached 10min — Apollo company search isn't free and the ICP doesn't
 * change minute-to-minute. */
export interface SuggestedAccount {
  name: string;
  domain: string;
  industry: string | null;
  size_band: string | null;
  country: string | null;
  apollo_id: string | null;
}

export function useSuggestedAccounts(limit: number = 8) {
  const { orgId } = useOrg();
  return useQuery<{ accounts: SuggestedAccount[]; total: number }>({
    queryKey: ["suggested_accounts", orgId, limit],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await sb().functions.invoke<{
        accounts: SuggestedAccount[];
        total: number;
      }>("apollo-suggest-accounts", { body: { limit } });
      if (error) throw error;
      return data ?? { accounts: [], total: 0 };
    },
    staleTime: 10 * 60_000,
    retry: false,
  });
}

/** Org's ICP target_titles, pulled from organisations.icp_config.target_titles.
 * Empty array if the org hasn't set them. Used by the accounts account page to
 * filter "People at this account" to roles the org actually sells to. */
export function useTargetTitles() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["target_titles", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await sb()
        .from("organisations")
        .select("icp_config")
        .eq("id", orgId)
        .maybeSingle();
      if (error) throw error;
      const cfg = (data?.icp_config ?? {}) as { target_titles?: string[] };
      const titles = cfg.target_titles;
      return Array.isArray(titles) ? titles.filter((t) => typeof t === "string" && t.trim()) : [];
    },
    staleTime: 5 * 60_000,
  });
}

export function useCompanyPeople(
  domain: string | undefined,
  options?: { titles?: string[]; limit?: number; enabled?: boolean },
) {
  const { orgId } = useOrg();
  const titlesParam = options?.titles?.join(",") ?? "";
  const limit = options?.limit ?? 25;
  return useQuery<CompanyPeopleResponse>({
    queryKey: ["company_people", orgId, domain, titlesParam, limit],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (titlesParam) qs.set("titles", titlesParam);
      qs.set("limit", String(limit));
      return await claraApi<CompanyPeopleResponse>(
        `/dashboard/${orgId}/company/${encodeURIComponent(
          (domain ?? "").toLowerCase(),
        )}/people?${qs.toString()}`,
        { method: "GET" },
      );
    },
    enabled:
      (options?.enabled ?? true) && !!orgId && !!domain,
    staleTime: 5 * 60_000,
  });
}

// Vocabularies are static — fetched once per session and cached forever
// (in practice: until the user reloads the dashboard).
export function useIcpVocabularies() {
  return useQuery({
    queryKey: ["icp-vocabularies"],
    queryFn: async () => {
      return await claraApi<IcpVocabularies>("/icp/vocabularies", {
        method: "GET",
      });
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

// ---------------------------------------------------------------------------
// Visible signal categories — the org's preference for which signal
// categories show up in the Accounts table's Signals column. Stored at
// organisations.icp_config.features.visible_signal_categories.
//
// null = "show all" (default behaviour for orgs that haven't customised).
// ---------------------------------------------------------------------------

export function useVisibleSignalCategories() {
  const sb = createSupabaseBrowserClient();
  return useQuery<string[] | null>({
    queryKey: ["signal-categories"],
    queryFn: async () => {
      const { data: { session } } = await sb.auth.getSession();
      const token = session?.access_token;
      if (!token) return null;
      const resp = await fetch("/api/settings/signal-categories", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return null;
      const body = await resp.json();
      return Array.isArray(body.visible_categories)
        ? body.visible_categories
        : null;
    },
    staleTime: 5 * 60_000,
  });
}

// ---------------------------------------------------------------------------
// Security vacancies (job-board watch, 2026-07-21)
//
// Volume is the signal here, not any single advert: a watched account with
// 20 open security roles is visibly building something, whether or not a rep
// cares about a specific job. Powers the accounts-table count and the
// account page's "Jobs hiring" list.
//
// Only OPEN (closed_at null) and only roles the cyber classifier accepted.
// RLS scopes rows to companies the org actually watches.
// ---------------------------------------------------------------------------

export interface SecurityJob {
  id: string;
  company_id: string;
  title: string;
  role_category: string | null;
  location: string | null;
  url: string | null;
  first_published: string | null;
  first_seen: string;
}

export function useSecurityJobs(companyIds: Array<string | null | undefined>) {
  const ids = [...new Set(companyIds.filter(Boolean) as string[])].sort();
  return useQuery({
    queryKey: ["security_jobs", ids],
    enabled: ids.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const byCompany = new Map<string, SecurityJob[]>();
      // Chunked: a large watchlist would otherwise build a huge `in` filter.
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await createSupabaseBrowserClient()
          .from("company_job_postings")
          .select(
            "id, company_id, title, role_category, location, url, first_published, first_seen",
          )
          .in("company_id", ids.slice(i, i + 100))
          .eq("is_security", true)
          .is("closed_at", null);
        if (error) throw error;
        for (const j of (data ?? []) as SecurityJob[]) {
          const arr = byCompany.get(j.company_id) ?? [];
          arr.push(j);
          byCompany.set(j.company_id, arr);
        }
      }
      // Freshest first — a role posted this week reads before one from March.
      for (const [companyId, arr] of byCompany) {
        arr.sort((a, b) =>
          (b.first_published ?? b.first_seen).localeCompare(
            a.first_published ?? a.first_seen,
          ),
        );
        // One role advertised in six cities is one opening, not six. Tide
        // listed the same threat-detection role six times, which made the
        // count read as a hiring spree.
        const seen = new Set<string>();
        byCompany.set(
          companyId,
          arr.filter((j) => {
            const key = j.title
              .toLowerCase()
              .replace(/[^a-z0-9 ]/g, " ")
              .replace(/\b\d+\b/g, " ")
              .replace(/\s+/g, " ")
              .trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          }),
        );
      }
      return byCompany;
    },
  });
}
