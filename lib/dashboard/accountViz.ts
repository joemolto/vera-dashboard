/** Account visualisation derivation — shared between /dashboard/accounts
 * (Signal Wave column in the main table) and /dashboard/accounts/visual-demo
 * (concept comparison page). Pure functions, no React.
 */

import { derivePosture } from "@/lib/dashboard/cyberIntent";
import type {
  AccountVizData,
  VizEvent,
} from "@/components/dashboard/widgets/viz/types";

interface CompanyMetaForViz {
  technologies: unknown[] | null;
  threat_alerts: unknown;
}

interface SignalEventInput {
  signal_type: string;
  signal_data: Record<string, unknown> | null;
  detected_at: string;
}

/** Signal type → category bucket for the 5-axis DNA / event colouring.
 * Keep social_* types in sync with the engine's social_listener output;
 * without them in this map the Activity graph silently drops every
 * Reddit/forum mention even though the row shows a count in the
 * Social cell. */
const SIGNAL_KIND: Record<string, VizEvent["kind"]> = {
  security_leadership_hire: "intent",
  new_leadership: "intent",
  security_team_expansion: "people",
  hiring_sales_bd: "people",
  cve_in_stack: "threat",
  breach_proximity: "threat",
  compliance_gap: "threat",
  recently_funded: "funding",
  recent_acquisition: "funding",
  product_launch: "intent",
  new_partnership: "intent",
  expansion: "people",
  // Social listening v2 — per-account chatter classified by Haiku.
  // Map to the 5 viz axes by what the signal actually conveys.
  social_funding_news: "funding",
  social_leadership_change: "intent",
  social_milestone: "intent",
  social_company_post: "intent",
  social_hiring_buzz: "people",
  social_employee_chatter: "people",
  social_vendor_relationship: "posture",
  social_breach_mention: "threat",
  social_complaint: "intent",
  social_customer_review: "intent",
  social_company_mention: "intent",
};

export function classifySignalKind(
  signalType: string,
): VizEvent["kind"] | null {
  return SIGNAL_KIND[signalType] ?? null;
}

export function deriveAccountViz(
  domain: string,
  company: CompanyMetaForViz | undefined,
  signals: SignalEventInput[],
): AccountVizData {
  // ---- Signal counts per category (last 90 days) ----
  const counts = { intent: 0, threat: 0, posture: 0, people: 0, funding: 0 };
  for (const s of signals) {
    const k = classifySignalKind(s.signal_type);
    if (k) counts[k] += 1;
  }
  const cap = 4;
  const signalsByCategory = {
    intent: Math.min(1, counts.intent / cap),
    threat: Math.min(1, counts.threat / cap),
    posture: 0, // filled below from coverage density
    people: Math.min(1, counts.people / cap),
    funding: Math.min(1, counts.funding / cap),
  };

  // ---- Posture coverage (4 cats + a SIEM heuristic for the 5th) ----
  const posture4 = derivePosture(company?.technologies ?? null);
  const techList = Array.isArray(company?.technologies)
    ? (company!.technologies as Array<{ name?: string }>)
    : [];
  const hasSiem = techList.some((t) => {
    const n = (t?.name ?? "").toLowerCase();
    return /(splunk|qradar|sentinel|sumo logic|datadog|elastic siem)/i.test(n);
  });
  const postureCovered = {
    iam: posture4.iam,
    edr: posture4.edr,
    email: posture4.email,
    waf: posture4.waf,
    siem: hasSiem,
  };
  const coveredCount = Object.values(postureCovered).filter(Boolean).length;
  signalsByCategory.posture = coveredCount / 5;

  // ---- Active CVE exposure (rough placeholder mapping) ----
  const ta = (company?.threat_alerts ?? []) as Array<unknown>;
  const hasCves = Array.isArray(ta) && ta.length > 0;
  const postureExposed = {
    iam: false,
    edr: hasCves,
    email: hasCves,
    waf: false,
    siem: false,
  };
  const exposedCount = Object.values(postureExposed).filter(Boolean).length;

  // ---- Recent hiring/leadership signal flag per category (placeholder) ----
  const postureSignal = {
    iam: counts.intent > 0,
    edr: counts.people > 0,
    email: false,
    waf: false,
    siem: false,
  };

  // ---- Time-bucketed events for Signal Wave / Convergence rings ----
  const now = Date.now();
  const last7d: VizEvent[] = [];
  const last30d: VizEvent[] = [];
  const last90d: VizEvent[] = [];
  for (const s of signals) {
    const kind = classifySignalKind(s.signal_type);
    if (!kind) continue;
    const data = s.signal_data || {};
    const label =
      (typeof data.headline === "string" && data.headline) ||
      s.signal_type.replace(/_/g, " ");
    const ageDays = (now - new Date(s.detected_at).getTime()) / 86_400_000;
    const ev: VizEvent = { kind, label };
    if (ageDays <= 7) last7d.push(ev);
    else if (ageDays <= 30) last30d.push(ev);
    else last90d.push(ev);
  }

  return {
    domain,
    signalsByCategory,
    postureCovered,
    postureExposed,
    postureSignal,
    coveredCount,
    exposedCount,
    eventBuckets: { last7d, last30d, last90d },
  };
}
