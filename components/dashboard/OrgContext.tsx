"use client";

import { createContext, useContext, useEffect } from "react";

import { identifyOrg } from "@/lib/analytics";

/** Feature flags read from organisations.icp_config.features. Used to
 * surface in-development surfaces (Intelligence Map, future graph
 * views) to specific orgs without code-side org_id checks. The
 * dashboard stays org-agnostic; only data flips the switch. */
export interface OrgFeatures {
  intelligence_map?: boolean;
  accounts_dashboard?: boolean;
  /** Phase-1 tabbed account page (Overview / People / Stack / Activity / Network)
   * plus richer hero. Orgs without the flag keep the scrolling layout
   * so the two can be compared side by side. */
  accounts_dashboard_tabs?: boolean;
  /** Social-listening v2 — per-account Social tab on the account page.
   * Engine fires social_listener.scan_account on every monitor pass
   * for accounts in orgs with this flag on. UI gating is here; cost
   * gating is in the monitor's heat cadence. Off by default for paying
   * customers so the new surface doesn't appear without onboarding. */
  social_listening?: boolean;
  /** Relevance scoring v1 — when true, signal feeds (home timeline)
   * call get_scored_signals RPC and sort by per-client priority score
   * instead of the global sales-lens whitelist + recency. Computed
   * server-side from icp_config.signal_priorities being populated
   * (presence of weights = ranking on). */
  signal_ranking?: boolean;
  /** Account suggestions pilot — when true, "Suggested accounts" tray
   * renders at the bottom of /dashboard/accounts. Candidates come from
   * Apollo org-search keyed off icp_config.personas[0]; self-regulating
   * pool of 10 pending rows. Pilot 2026-06-07. */
  account_suggestions?: boolean;
  /** Home dashboard v2 — layout with welcome +
   * KPI grid + signal activity chart + top accounts + what's new feed.
   * Gated per-org; pilot 2026-06-08. Orgs without the flag keep the
   * legacy home. */
  home_v2?: boolean;
  /** Analytics page v2 — account-centric data-dense rebuild
   * (replaces the lead-centric hot/warm/cold donut + vanity counts).
   * KPIs with deltas, stacked signal activity chart, working/
   * underperforming side-by-side, trigger-type breakdown, credit
   * ledger card. Pilot 2026-06-08. */
  analytics_v2?: boolean;
  /** Cyber lens v1 — replace the buying-trigger/other split on the
   * account dossier with four lens sections (Risk / Posture / Maturity /
   * Commercial) plus an "Other" bucket for unmapped signal_types.
   * Pilot 2026-06-09. */
  cyber_lens_v1?: boolean;
  /** Intelligence-only experience — no AI-drafted openers, emails, or
   * "what to say" copy anywhere (product rule 10 enforced in the UI).
   * Also gates the upcoming Accounts|People toggle and light theme.
   * Pilot 2026-06-11. */
  intelligence_only?: boolean;
  /** Decoupled monitoring — new accounts are Research (one-time snapshot)
   * not auto-monitored; the accounts page splits into Research |
   * Monitored | People. Accounts auto-promote to Monitored on committed
   * actions (unlock contact, enable person intel). Pilot 2026-06-11. */
  decoupled_monitoring?: boolean;
  /** Your market — TAM + market radar page (/dashboard/market). Observed
   * market from the accounts the org watches, countable universe +
   * verified weekly movement slices. Pilot 2026-08-13. */
  market_v1?: boolean;
  /** Vera Solo (self-serve tier) — sold on hard caps, not
   * credits. Shows the cap chrome (research + unlocks left this month,
   * watched accounts/people in use) and upgrade nudges at ceilings.
   * 2026-06-11. */
  solo_plan?: boolean;
  /** Starter (fenced entry plan, 2026-07-15) — sits on top of
   * solo_plan (same cap chrome) and fences smart groups + the developer
   * surfaces behind an upgrade prompt. No capacity packs. */
  starter_plan?: boolean;
  /** Groups — named sets of accounts/people, manual or smart. */
  groups?: boolean;
  /** Integrations — connect external destinations (Slack first) so Vera
   * pushes its intelligence into the tools the team already uses. */
  integrations?: boolean;
  /** Competitor watch — home-screen feed of competitors' LinkedIn posts +
   * the security people engaging with them. Weekly engine scan writes
   * competitor_feed; zero-config (competitors resolved from client context
   * or curated sector defaults). 2026-07-07. */
  competitor_feed?: boolean;
  /** People posts — home-screen feed of watched people's own LinkedIn
   * posts/engagement rendered as LinkedIn-style cards (person_* signals
   * from the weekly person monitor). 2026-07-07. */
  people_feed?: boolean;
  /** One-click "Add to HubSpot" on people surfaces + HubSpot connect card
   * on Integrations. The adoption blocker is workflow hops, not data.
   * Demo-mode UX first (localStorage, no real OAuth) — pilot. */
  hubspot_push?: boolean;
  /** Multiple markets (multi-ICP) — market switcher pills + editor drawer
   * on /dashboard/market (create/edit/delete markets, per-market deal
   * size), e.g. an end-customer vs partner split. Counts per tier:
   * Starter 1 / Individual 3 / Team custom. Pilot 2026-08-23. */
  multi_market?: boolean;
}

interface OrgContextValue {
  orgId: string;
  orgName: string;
  userEmail: string;
  /** Seller's own domain (icp_config.brand_domain) — drives the workspace logo
   * via logo.dev. */
  domain?: string | null;
  /** Custom uploaded workspace logo (icp_config.logo_url) — overrides logo.dev. */
  logoUrl?: string | null;
  /** icp_config.signal_priorities — per-org signal weights. Types weighted
   * >= 0.8 join the buying-trigger whitelist (buyingTriggerSetFor). */
  signalPriorities?: Record<string, number>;
  /** Display name pulled from auth.users.raw_user_meta_data.first_name (with
   * full_name as fallback). Empty string if neither is set — UI should
   * gracefully degrade to "Good morning." with no name in that case. */
  firstName: string;
  features: OrgFeatures;
  /** Stripe subscription status on the org row. "canceled" / "unpaid" /
   * "incomplete_expired" mean billing has lapsed → read-only (the engine
   * already zeroes caps for these; the UI shows the reactivate state).
   * null/"active"/"past_due" are live. */
  subscriptionStatus?: string | null;
  /** Vera Solo org that hasn't finished the onboarding wizard yet —
   * drives the onboarding modal. */
  onboardingPending?: boolean;
}

/** Billing lapsed → read-only. Must match the engine's REVOKED_STATUSES. */
export const REVOKED_STATUSES = new Set(["canceled", "unpaid", "incomplete_expired"]);

export function isBillingLapsed(status?: string | null): boolean {
  return !!status && REVOKED_STATUSES.has(status.toLowerCase());
}

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({
  value,
  children,
}: {
  value: OrgContextValue;
  children: React.ReactNode;
}) {
  // Tie analytics to the org (id, not email — no PII in PostHog) so
  // per-customer funnels and the activation metric work.
  useEffect(() => {
    if (value.orgId) identifyOrg(value.orgId, value.orgName);
  }, [value.orgId, value.orgName]);
  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used inside <OrgProvider>");
  return ctx;
}
