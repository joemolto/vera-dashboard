"use client";

/**
 * Groups — named sets of accounts or people, manual or smart (a saved live
 * filter). The intelligence layer: a Vera group is watched, not dead storage.
 * v1 ships the data layer + a self-contained Groups page; "add to group" from
 * the Accounts/Prospects tables, the cross-group roll-up and the notify job are
 * fast-follows. Flag-gated on features.groups.
 *
 * Refs: an account member is keyed by company_domain; a people member by lead id.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useOrg } from "@/components/dashboard/OrgContext";
import type { Lead, WatchlistCompany } from "./types";

const sb = () => createSupabaseBrowserClient();

export type GroupEntityType = "account" | "people";
export type GroupMode = "manual" | "smart";

/** Smart-group rules. v1 was one number per account group; v2 (2026-07-16,
 *  from the ABM-persona simulation) tiers accounts by industry, region,
 *  size and signal recency as well. */
export interface GroupRules {
  /** People: AI-expanded list of matching job titles (match if a title contains any). */
  titles?: string[];
  /** People AND accounts: industries to match (contains-any, lowercase). */
  industries?: string[];
  /** Legacy single industry (back-compat). */
  industry?: string | null;
  /** Account: regions/countries to match (contains-any against HQ country/city). */
  regions?: string[];
  /** Legacy single region (back-compat, treated as regions[0]). */
  region?: string | null;
  /** Account: match watched accounts with a profile score at or above this. */
  min_score?: number;
  /** Account: employee-count bounds, matched against the company size band. */
  min_employees?: number;
  max_employees?: number;
  /** Account: at least this many signals in the last 30 days. */
  min_signals_30d?: number;
  /** Legacy manual single-title contains (kept for back-compat). */
  title_contains?: string;
}

/** Company facts for the org's watched domains — industry/geo/size for the
 *  account smart-group matcher. Same shared-cache read the home nudge uses. */
export function useWatchedCompanyFacts(domains: string[]) {
  return useQuery({
    queryKey: ["group_company_facts", [...domains].sort()],
    enabled: domains.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await sb()
        .from("companies")
        .select("domain, industry, hq_country, hq_city, size_band")
        .in("domain", domains);
      if (error) throw error;
      const map = new Map<
        string,
        { industry: string | null; hq_country: string | null; hq_city: string | null; size_band: string | null }
      >();
      for (const c of (data ?? []) as Array<{
        domain: string | null;
        industry: string | null;
        hq_country: string | null;
        hq_city: string | null;
        size_band: string | null;
      }>) {
        if (c.domain) map.set(c.domain.toLowerCase(), c);
      }
      return map;
    },
  });
}

/** Lower bound of a size band: "1001-5000" -> 1001, "40" -> 40. */
function bandLow(band: string | null | undefined): number | null {
  const m = String(band ?? "").match(/\d+/);
  return m ? Number(m[0]) : null;
}

export interface Group {
  id: string;
  org_id: string;
  name: string;
  entity_type: GroupEntityType;
  mode: GroupMode;
  rules: GroupRules;
  notify: boolean;
  created_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  entity_type: GroupEntityType;
  entity_ref: string;
  added_at: string;
}

export function useGroups() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["groups", orgId],
    queryFn: async () => {
      const { data, error } = await sb()
        .from("groups")
        .select("id, org_id, name, entity_type, mode, rules, notify, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Group[];
    },
  });
}

/** Manual member counts per group (smart counts are computed client-side). */
export function useGroupMemberCounts() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["group_member_counts", orgId],
    queryFn: async () => {
      const { data, error } = await sb()
        .from("group_members")
        .select("group_id")
        .eq("org_id", orgId);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const r of (data ?? []) as { group_id: string }[]) {
        counts[r.group_id] = (counts[r.group_id] ?? 0) + 1;
      }
      return counts;
    },
  });
}

export function useGroupMembers(groupId: string | null) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["group_members", orgId, groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await sb()
        .from("group_members")
        .select("id, group_id, entity_type, entity_ref, added_at")
        .eq("group_id", groupId!)
        .order("added_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as GroupMember[];
    },
  });
}

export function useCreateGroup() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (g: {
      name: string;
      entity_type: GroupEntityType;
      mode: GroupMode;
      rules?: GroupRules;
      notify?: boolean;
    }) => {
      const { data, error } = await sb()
        .from("groups")
        .insert({
          org_id: orgId,
          name: g.name.trim(),
          entity_type: g.entity_type,
          mode: g.mode,
          rules: g.rules ?? {},
          notify: g.notify ?? false,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["groups", orgId] }),
  });
}

export function useUpdateGroup() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { id: string; rules?: GroupRules; notify?: boolean; name?: string }) => {
      const { id, ...fields } = patch;
      const { error } = await sb()
        .from("groups")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["groups", orgId] }),
  });
}

export function useDeleteGroup() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb().from("groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["groups", orgId] });
      qc.invalidateQueries({ queryKey: ["group_member_counts", orgId] });
    },
  });
}

export function useAddMembers() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: { groupId: string; entityType: GroupEntityType; refs: string[] }) => {
      const rows = m.refs.map((ref) => ({
        group_id: m.groupId,
        org_id: orgId,
        entity_type: m.entityType,
        entity_ref: ref,
      }));
      // Ignore duplicates (unique group_id + entity_ref).
      const { error } = await sb().from("group_members").upsert(rows, {
        onConflict: "group_id,entity_ref",
        ignoreDuplicates: true,
      });
      if (error) throw error;
    },
    onSuccess: (_d, m) => {
      qc.invalidateQueries({ queryKey: ["group_members", orgId, m.groupId] });
      qc.invalidateQueries({ queryKey: ["group_member_counts", orgId] });
    },
  });
}

export function useRemoveMember() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: { memberId: string; groupId: string }) => {
      const { error } = await sb().from("group_members").delete().eq("id", m.memberId);
      if (error) throw error;
    },
    onSuccess: (_d, m) => {
      qc.invalidateQueries({ queryKey: ["group_members", orgId, m.groupId] });
      qc.invalidateQueries({ queryKey: ["group_member_counts", orgId] });
    },
  });
}

/**
 * Live membership for a SMART group, computed from the org's data + the rules.
 * Returns the entity refs (account: domain, people: lead id) that match.
 */
export function smartMatchRefs(
  group: Pick<Group, "entity_type" | "rules">,
  src: {
    leads?: Lead[];
    watchlist?: WatchlistCompany[];
    accountScores?: Map<string, { score: number; signalCount: number }>;
    companyFacts?: Map<
      string,
      { industry: string | null; hq_country: string | null; hq_city: string | null; size_band: string | null }
    >;
  },
): string[] {
  const { entity_type, rules } = group;
  if (entity_type === "people") {
    const titles = (rules.titles ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean);
    const legacy = (rules.title_contains ?? "").trim().toLowerCase();
    const industries = [...(rules.industries ?? []), ...(rules.industry ? [rules.industry] : [])]
      .map((i) => i.toLowerCase().trim())
      .filter(Boolean);
    if (titles.length === 0 && !legacy) return [];
    return (src.leads ?? [])
      .filter((l) => {
        const t = (l.title ?? "").toLowerCase();
        const titleOk = titles.length ? titles.some((x) => t.includes(x)) : t.includes(legacy);
        if (!titleOk) return false;
        if (industries.length) {
          const ind = (l.company_industry ?? "").toLowerCase();
          if (!industries.some((x) => ind.includes(x))) return false;
        }
        return true;
      })
      .map((l) => l.id);
  }
  // accounts — tier watched domains by score, industry, region, size and
  // signal recency. Rules the org didn't set never filter.
  const min = rules.min_score ?? 0;
  const industries = [...(rules.industries ?? []), ...(rules.industry ? [rules.industry] : [])]
    .map((i) => i.toLowerCase().trim())
    .filter(Boolean);
  const regions = [...(rules.regions ?? []), ...(rules.region ? [rules.region] : [])]
    .map((r) => r.toLowerCase().trim())
    .filter(Boolean);
  const scores = src.accountScores;
  const facts = src.companyFacts;
  return (src.watchlist ?? [])
    .map((w) => (w.company_domain ?? "").toLowerCase())
    .filter(Boolean)
    .filter((dom) => {
      if (min > 0 && (scores?.get(dom)?.score ?? 0) < min) return false;
      if ((rules.min_signals_30d ?? 0) > 0 && (scores?.get(dom)?.signalCount ?? 0) < rules.min_signals_30d!)
        return false;
      const f = facts?.get(dom);
      if (industries.length) {
        const ind = (f?.industry ?? "").toLowerCase();
        if (!industries.some((x) => ind.includes(x))) return false;
      }
      if (regions.length) {
        const geo = `${f?.hq_country ?? ""} ${f?.hq_city ?? ""}`.toLowerCase();
        if (!regions.some((x) => geo.includes(x))) return false;
      }
      if (rules.min_employees != null || rules.max_employees != null) {
        const low = bandLow(f?.size_band);
        if (low == null) return false;
        if (rules.min_employees != null && low < rules.min_employees) return false;
        if (rules.max_employees != null && low > rules.max_employees) return false;
      }
      return true;
    });
}
