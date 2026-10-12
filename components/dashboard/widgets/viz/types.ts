/** Shared data shape for the account-visualisation experiments.
 * Derived per-domain from signals + companies + watchlist_alerts. */
export interface AccountVizData {
  domain: string;
  /** Bar heights normalised 0..1 per signal category. */
  signalsByCategory: {
    intent: number;
    threat: number;
    posture: number;
    people: number;
    funding: number;
  };
  /** Per cyber-tool category: did we detect coverage? */
  postureCovered: {
    iam: boolean;
    edr: boolean;
    email: boolean;
    waf: boolean;
    siem: boolean;
  };
  /** Active threat exposure per category (rough — CVE count > 0). */
  postureExposed: {
    iam: boolean;
    edr: boolean;
    email: boolean;
    waf: boolean;
    siem: boolean;
  };
  /** Active hiring/signal in that category (last 90d). */
  postureSignal: {
    iam: boolean;
    edr: boolean;
    email: boolean;
    waf: boolean;
    siem: boolean;
  };
  /** Counts for the threat<->posture balance bar. */
  coveredCount: number;
  exposedCount: number;
  /** Time-bucketed signal events for the convergence rings. */
  eventBuckets: {
    last7d: VizEvent[];
    last30d: VizEvent[];
    last90d: VizEvent[];
  };
}

export interface VizEvent {
  /** Signal category drives the colour. */
  kind: "intent" | "threat" | "posture" | "people" | "funding";
  /** Headline for tooltip. */
  label: string;
}
