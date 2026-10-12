/**
 * Product analytics events (Phase 0, 2026-07-08). Thin wrapper over the
 * PostHog snippet loaded in app/layout.tsx — safe no-op when PostHog is
 * absent (env-gated) or blocked, so callers never guard.
 *
 * THE EVENT SET IS DELIBERATELY SMALL (~10). These power the activation
 * metric: "researched 3+ accounts AND unlocked 1+ contact in week one",
 * plus weekly-return retention. Add events only when a question needs
 * answering — autocapture already records every click.
 */

type Props = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    posthog?: {
      capture: (event: string, props?: Props) => void;
      identify: (id: string, props?: Props) => void;
    };
  }
}

export function track(event: string, props?: Props): void {
  try {
    window.posthog?.capture(event, props);
  } catch {
    // analytics must never break the product
  }
}

/** Tie events to the org so per-customer funnels work. Call once per
 * session from the dashboard shell; uses org id (not email) as the
 * distinct id to keep PII out of PostHog. */
export function identifyOrg(orgId: string, orgName?: string): void {
  try {
    window.posthog?.identify(orgId, orgName ? { org_name: orgName } : undefined);
  } catch {
    /* no-op */
  }
}

/* Canonical event names — import these, don't inline strings.
 * research_run        — quick-enrich submitted (domain or LinkedIn URL)
 * contact_unlocked    — paid Apollo reveal completed
 * person_watched      — person_monitoring toggled on
 * contact_dismissed   — "Not relevant" on a contact card
 * signal_clicked      — a signal row/nudge followed to an account
 * post_opened         — a LinkedIn post card clicked through
 * onboarding_completed— Solo wizard finished
 * account_monitored   — monitoring enabled on an account
 */
export const EV = {
  researchRun: "research_run",
  contactUnlocked: "contact_unlocked",
  personWatched: "person_watched",
  contactDismissed: "contact_dismissed",
  signalClicked: "signal_clicked",
  postOpened: "post_opened",
  onboardingCompleted: "onboarding_completed",
  accountMonitored: "account_monitored",
} as const;
