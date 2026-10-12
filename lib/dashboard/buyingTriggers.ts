/**
 * Canonical buying-trigger signal types. Used everywhere we filter
 * down from the full 50+ engine signal_types to the opener-worthy
 * subset that should actually surface to a rep on a customer page.
 *
 * Single source of truth — HomeV2, AnalyticsV2, and the account
 * dossier's "Why this account matters" all import from here so the
 * "Buying triggers" KPI on Home matches the rows in "Today's hot
 * accounts" matches the bars on Analytics matches the bullets on
 * Why-this-matters.
 *
 * Adding a new buying-trigger type: add it here, surfaces pick it up.
 * Removing one: same — everything that filters by this set drops it.
 */

export const BUYING_TRIGGER_TYPES: ReadonlySet<string> = new Set([
  // Breach
  "social_breach_mention",
  "breach_proximity",
  "breach_mention", // PL-news twin of social_breach_mention (added 2026-07-07)
  // Credential exposure (stealer logs / dark web)
  "credential_leak",
  "credential_leak_supply_chain",
  // Leadership
  "security_leadership_hire",
  "social_leadership_change",
  "new_leadership",
  // Funding / M&A
  "recently_funded",
  "social_funding_news",
  "recent_acquisition",
  // Security hiring
  "security_team_expansion",
  "hiring_security",
  "hiring_grc", // was in why-now but not here — lists now agree (2026-07-07)
  // Vendor stack — a prospect publicly discussing their security vendors.
  // 88 rows in the 90 days to 2026-07-07 with the richest payloads in the
  // signals table, previously invisible outside the dossier axis view.
  "social_vendor_relationship",
  // Person intel
  "person_engaged_with_competitor",
  "person_new_in_role",
  "person_posted_relevant_topic",
  "person_engaged_with_topic",
]);

export function isBuyingTrigger(signalType: string): boolean {
  return BUYING_TRIGGER_TYPES.has(signalType);
}

/** Org-aware whitelist: the universal set plus any type this org weights
 * highly in icp_config.signal_priorities (>= 0.8). Resolves the universal-
 * whitelist-vs-per-client-weights conflict — e.g. cve_in_stack is excluded
 * globally (anti-ambulance) but an org selling threat intel may weight it
 * 1.0, and for that org it counts as a buying trigger. */
export function buyingTriggerSetFor(
  priorities?: Record<string, number> | null,
): ReadonlySet<string> {
  if (!priorities) return BUYING_TRIGGER_TYPES;
  const extras = Object.entries(priorities)
    .filter(([, w]) => typeof w === "number" && w >= 0.8)
    .map(([t]) => t);
  if (extras.length === 0) return BUYING_TRIGGER_TYPES;
  return new Set([...BUYING_TRIGGER_TYPES, ...extras]);
}

const EMPTY_HIDDEN: ReadonlySet<string> = new Set();

/** The mirror of buyingTriggerSetFor's extras: signal types this org must
 * NEVER see. Weight exactly 0 in icp_config.signal_priorities = hidden on
 * every surface (onboarding signal step, 2026-08-14 —
 * credential leaks are dark-web intel, wrong for a vuln-management vendor).
 * Display-only: collection and the shared cache are untouched. */
export function hiddenSignalTypes(
  priorities?: Record<string, number> | null,
): ReadonlySet<string> {
  if (!priorities) return EMPTY_HIDDEN;
  const hidden = Object.entries(priorities)
    .filter(([, w]) => typeof w === "number" && w === 0)
    .map(([t]) => t);
  return hidden.length ? new Set(hidden) : EMPTY_HIDDEN;
}

export function dropHiddenSignals<T extends { signal_type?: string | null }>(
  rows: T[],
  hidden: ReadonlySet<string>,
): T[] {
  if (hidden.size === 0) return rows;
  return rows.filter((r) => !hidden.has(r.signal_type || ""));
}

/**
 * Social signal types worth surfacing to a B2B sales team — the ones
 * that signal a buying context (security, funding, leadership, product/
 * milestone, vendor stack, security hiring). Everything else the social
 * listener produces (generic mentions, customer complaints, consumer
 * reviews, employee small-talk, first-party marketing posts) is noise
 * and must not render as a social signal: social should be relevant,
 * not noise. The engine also drops these noise
 * types at write time (signal_writer.DROP_AT_WRITE); this is the
 * front-end guard for any that predate that.
 */
export const RELEVANT_SOCIAL_TYPES: ReadonlySet<string> = new Set([
  "social_breach_mention",
  "social_funding_news",
  "social_leadership_change",
  "social_milestone",
  "social_vendor_relationship",
  "social_hiring_buzz",
]);

export function isRelevantSocial(signalType: string | null | undefined): boolean {
  return !!signalType && RELEVANT_SOCIAL_TYPES.has(signalType);
}
