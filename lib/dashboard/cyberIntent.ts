/**
 * Cyber-native intent + posture derivations for the accounts table.
 *
 * Keep these pure — no React imports — so the same logic can be reused
 * by any dashboard surface (digest, brief, future overview widgets).
 */

// ---------------------------------------------------------------------------
// "Why now" — short label derived from the latest signal/alert category.
// Returns null when there's no recognised intent.
// ---------------------------------------------------------------------------

/** Engine signal_type values (from signals table).
 *
 * Source of truth: app/services/signal_writer.py KNOWN_SIGNAL_TYPES.
 * Keep this aligned — unmapped types render as snake_case which is
 * ugly. */
const SIGNAL_TYPE_LABELS: Record<string, string> = {
  // Account-level (trigger)
  security_leadership_hire: "NEW SEC LEAD",
  new_leadership: "NEW LEAD",
  recently_funded: "FUNDED",
  recent_acquisition: "ACQUIRED",
  product_launch: "PRODUCT LAUNCH",
  new_partnership: "PARTNERSHIP",
  expansion: "EXPANSION",
  security_team_expansion: "HIRING SOC",
  hiring_sales_bd: "HIRING BD",
  hiring_security: "HIRING SEC",
  hiring_grc: "HIRING GRC",
  cve_in_stack: "CVE EXPOSURE",
  // compliance_gap REMOVED 2026-05-28 — overconfident framing
  breach_proximity: "BREACH NEARBY",
  // Person-level (Phase 3)
  person_new_in_role: "NEW IN ROLE",
  person_promoted: "PROMOTED",
  person_changed_company: "CHANGED CO",
  person_security_leader: "SEC LEADER",
  person_grc_leader: "GRC LEADER",
  person_technical_leader: "TECH LEADER",
  person_commercial_leader: "COMM LEADER",
  person_prior_vendor_experience: "PRIOR VENDOR",
  person_active_linkedin: "ACTIVE LI",
  person_posted_relevant_topic: "POSTED TOPIC",
  // Job keyword (Phase 4)
  job_mentions_soc2: "JD: SOC 2",
  job_mentions_iso27001: "JD: ISO 27001",
  job_mentions_security_questionnaires: "JD: SEC REVIEWS",
  job_mentions_vendor_risk: "JD: VENDOR RISK",
  job_mentions_audit: "JD: AUDIT",
  job_mentions_cloud_security: "JD: CLOUD SEC",
  job_mentions_identity: "JD: IDENTITY",
  job_mentions_siem: "JD: SIEM",
  job_mentions_edr: "JD: EDR",
  job_mentions_vuln_mgmt: "JD: VULN MGMT",
  job_mentions_incident_response: "JD: IR",
  job_mentions_devsecops: "JD: DEVSECOPS",
  compliance_workflow_pressure: "COMPL WORKFLOW",
  security_operations_pressure: "SEC OPS",
  cloud_security_pressure: "CLOUD SEC FOCUS",
  appsec_pressure: "APPSEC",
  enterprise_trust_pressure: "ENT TRUST",
  // Website / posture (Phase 5)
  trust_center_present: "TRUST CENTRE",
  security_page_present: "SEC PAGE",
  compliance_page_present: "COMPL PAGE",
  privacy_page_present: "PRIVACY PAGE",
  dpa_present: "DPA",
  subprocessors_present: "SUBPROCESSORS",
  status_page_present: "STATUS PAGE",
  responsible_disclosure_present: "RESP DISCL",
  bug_bounty_present: "BUG BOUNTY",
  security_contact_present: "SEC CONTACT",
  certification_claim_detected: "CERT CLAIM",
  // certification_gap + security_proof_gap REMOVED 2026-05-28 — replaced by
  // public_proof_not_visible (visibility, not deficiency framing).
  public_proof_not_visible: "PROOF NOT PUBLIC",
  enterprise_page_detected: "ENT PAGE",
  api_or_developer_platform: "API/DEV PLATFORM",
  enterprise_customer_detected: "ENT CUSTOMER",
  regulated_customer_detected: "REG CUSTOMER",
  public_sector_customer_detected: "GOV CUSTOMER",
  // Compound (Phase 6)
  enterprise_readiness_pressure: "ENT READINESS",
  customer_security_review_pressure: "CSR WORKFLOW",
  post_funding_security_maturity_push: "POST-RAISE PUSH",
  upmarket_security_friction: "UPMARKET FRICTION",
  compliance_operationalisation: "COMPL OPS",
  security_team_scaling: "SEC TEAM SCALE",
  cloud_security_scaling: "CLOUD SEC SCALE",
  revenue_blocker_likely: "REVENUE BLOCKER",
};

/** Watchlist alert_type values (from watchlist_alerts table).
 *
 * Source of truth: app/services/watchlist/change_detector.py +
 * watchlist/monitor.py. Don't collapse semantically distinct types
 * into one bucket — hiring_sales and hiring_security mean very
 * different things to a cyber-vendor sales rep. */
const ALERT_TYPE_LABELS: Record<string, string> = {
  // PL news flag-transition events
  funding_round: "FUNDING ROUND",
  acquisition: "ACQUISITION",
  product_launch: "PRODUCT LAUNCH",
  partnership: "PARTNERSHIP",
  predictleads_news: "COMPANY NEWS",
  // Hiring — separately labelled per role family
  hiring_sales: "SALES HIRING",
  hiring_leadership: "LEADERSHIP HIRING",
  hiring_security: "SECURITY HIRING",
  new_job_posting: "NEW ROLE POSTED",
  // Tech stack diffs
  tech_stack_added: "TECH ADDED",
  tech_stack_removed: "TECH REMOVED",
  // Site / content
  website_change: "WEBSITE CHANGE",
  new_blog_post: "NEW BLOG POST",
  // Monitor pass discoveries
  contact_activity: "CONTACT ACTIVE",
  // Legacy short forms — kept for old rows in the DB
  hiring: "HIRING",
  funding: "FUNDED",
  press: "PRESS",
};

/** Perplexity diffs are prefixed `perplexity_*` (e.g. perplexity_growth_signals).
 * Render with a generic "RESEARCH UPDATE" label rather than the raw
 * key — keeps backend tool names off the dashboard. */
function alertLabelForType(alertType: string | null | undefined): string | null {
  if (!alertType) return null;
  if (alertType in ALERT_TYPE_LABELS) return ALERT_TYPE_LABELS[alertType];
  if (alertType.startsWith("perplexity_")) return "RESEARCH UPDATE";
  return null;
}
export { alertLabelForType };

export interface IntentLabel {
  label: string;
  /** Tailwind color hint — drives the pill colour. */
  tone: "hot" | "warm" | "neutral";
}

const HOT_LABELS = new Set([
  "NEW SEC LEAD",
  "FUNDED",
  "ACQUIRED",
  "BREACH NEARBY",
  "CVE EXPOSURE",
  "COMPLIANCE GAP",
]);

export function deriveIntent(args: {
  signalType?: string | null;
  alertType?: string | null;
}): IntentLabel | null {
  const fromSignal = args.signalType
    ? SIGNAL_TYPE_LABELS[args.signalType]
    : null;
  const fromAlert = args.alertType ? ALERT_TYPE_LABELS[args.alertType] : null;
  const label = fromSignal ?? fromAlert ?? null;
  if (!label) return null;
  return {
    label,
    tone: HOT_LABELS.has(label) ? "hot" : "warm",
  };
}

// ---------------------------------------------------------------------------
// Posture — does the account have something in each of IAM / EDR / EMAIL /
// WAF? Derived from the companies.technologies array.
//
// The PL pipeline marks every tech with category="other" so we can't trust
// that field for cyber category. We match by tech name against a curated
// table mirroring the engine's stack_detection/config/security_tools.yaml.
// Lowercased substring matching keeps it tolerant to PL's variants
// ("Mimecast Secure Email Gateway", "Microsoft Entra ID", etc.).
// ---------------------------------------------------------------------------

export type PostureCategory = "iam" | "edr" | "email" | "waf";

interface PostureMatcher {
  category: PostureCategory;
  needles: string[]; // lowercased substrings; any match counts as a hit
}

const POSTURE_MATCHERS: PostureMatcher[] = [
  {
    category: "iam",
    needles: [
      "okta",
      "auth0",
      "ping identity",
      "pingfederate",
      "pingone",
      "azure ad",
      "entra id",
      "microsoft entra",
      "azure active directory",
      "duo security",
      "jumpcloud",
      "onelogin",
      "saml",
    ],
  },
  {
    category: "edr",
    needles: [
      "crowdstrike",
      "falcon insight",
      "sentinelone",
      "sentinel one",
      "singularity xdr",
      "defender for endpoint",
      "microsoft defender atp",
      "mdatp",
      "microsoft defender xdr",
      "carbon black",
      "cb defense",
      "sophos intercept",
    ],
  },
  {
    category: "email",
    needles: [
      "mimecast",
      "proofpoint",
      "abnormal security",
      "abnormal",
      "ironscales",
      "tessian",
      // M365 / Google Workspace count as basic email infra coverage
      "protection.outlook.com",
      "microsoft 365",
      "google workspace",
    ],
  },
  {
    category: "waf",
    needles: [
      "zscaler",
      "cloudflare",
      "akamai",
      "kona site defender",
      "imperva",
      "f5 networks",
      "fortiweb",
      "barracuda waf",
      "aws waf",
      "azure waf",
    ],
  },
];

export type PostureCoverage = Record<PostureCategory, boolean>;

const EMPTY_POSTURE: PostureCoverage = {
  iam: false,
  edr: false,
  email: false,
  waf: false,
};

export function derivePosture(
  technologies: unknown[] | null | undefined,
): PostureCoverage {
  if (!Array.isArray(technologies) || technologies.length === 0) {
    return { ...EMPTY_POSTURE };
  }
  const coverage = { ...EMPTY_POSTURE };
  for (const entry of technologies) {
    const name =
      typeof entry === "string"
        ? entry
        : entry && typeof entry === "object" && "name" in entry
          ? String((entry as { name?: unknown }).name ?? "")
          : "";
    if (!name) continue;
    const lc = name.toLowerCase();
    for (const m of POSTURE_MATCHERS) {
      if (coverage[m.category]) continue; // already matched
      if (m.needles.some((n) => lc.includes(n))) {
        coverage[m.category] = true;
      }
    }
  }
  return coverage;
}

export const POSTURE_LABELS: Record<PostureCategory, string> = {
  iam: "IAM",
  edr: "EDR",
  email: "Email security",
  waf: "WAF / edge",
};

export const POSTURE_ORDER: PostureCategory[] = ["iam", "edr", "email", "waf"];

// ---------------------------------------------------------------------------
// Revenue — extract from the deep_research_data JSON blob (and Apollo
// org-enrich blob, when we eventually wire it). Returns the printed value
// or null if not found.
// ---------------------------------------------------------------------------

export function deriveRevenue(args: {
  deep_research_data: unknown;
  apollo_data: unknown;
}): string | null {
  // Apollo org-enrich is preferred — it returns a clean printed format
  // like "$1.1B". Falls back to deep_research's free-text estimate.
  // The engine normalises Apollo's `organization_revenue*` fields to
  // `annual_revenue*` in our apollo_data blob — check both for safety.
  const apollo = args.apollo_data as Record<string, unknown> | null | undefined;
  if (apollo && typeof apollo === "object") {
    const printed =
      apollo.annual_revenue_printed ?? apollo.organization_revenue_printed;
    if (typeof printed === "string" && printed.trim()) {
      const t = printed.trim();
      // Apollo returns "9M" / "3B" without a currency prefix. Add one.
      return /^[£$€]/.test(t) ? t : `$${t}`;
    }
    const raw = apollo.annual_revenue ?? apollo.organization_revenue;
    if (typeof raw === "number" && raw > 0) return formatMoney(raw);
  }
  const dr = args.deep_research_data as Record<string, unknown> | null | undefined;
  if (dr && typeof dr === "object") {
    const biz = dr.business_intel as Record<string, unknown> | undefined;
    if (biz) {
      const est = biz.estimated_revenue;
      if (typeof est === "string") {
        const trimmed = est.trim();
        if (trimmed && trimmed.toLowerCase() !== "not found") return trimmed;
      }
    }
  }
  return null;
}

function formatMoney(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

// ---------------------------------------------------------------------------
// CVEs in stack — derived from the companies.threat_alerts array. Each
// entry is a CVE/threat record with title, severity, urgency, source.
// Returns the count + a tone for the cell. KEV (actively exploited) is
// the strongest tone.
// ---------------------------------------------------------------------------

export interface CveSummary {
  total: number;
  kev: number;          // CISA-known-exploited
  critical: number;
  high: number;
  /** Tone for the cell pill. */
  tone: "kev" | "critical" | "high" | "none";
}

// ---------------------------------------------------------------------------
// Buying-committee role — for the cyber-vendor sale, map each surfaced
// person at an account into one of four committee roles so the user can
// see who's the economic buyer vs the technical evaluator vs the influencer
// vs the end-user. Drives the multithreading view on the account account page.
// ---------------------------------------------------------------------------

export type BuyingRole =
  | "decision-maker"     // CISO / CSO — owns the budget
  | "technical-evaluator" // VP/Director/Head of Security — validates the tech
  | "influencer"          // GRC / compliance / risk / audit — gates the buy
  | "end-user"            // SOC / analyst / engineer — uses the product
  | "other";

export const BUYING_ROLE_LABELS: Record<BuyingRole, string> = {
  "decision-maker": "Decision-maker",
  "technical-evaluator": "Technical eval",
  influencer: "Influencer",
  "end-user": "End-user",
  other: "Other",
};

const BUYING_ROLE_RANK: Record<BuyingRole, number> = {
  "decision-maker": 0,
  "technical-evaluator": 1,
  influencer: 2,
  "end-user": 3,
  other: 4,
};

export function compareByBuyingRole(a: BuyingRole, b: BuyingRole): number {
  return BUYING_ROLE_RANK[a] - BUYING_ROLE_RANK[b];
}

export function deriveBuyingRole(args: {
  title: string;
  seniority?: string;
}): BuyingRole {
  const title = (args.title || "").toLowerCase();
  const seniority = (args.seniority || "").toLowerCase();
  if (!title) return "other";

  // 1. Decision-maker — chief-level security leadership
  if (
    title.includes("ciso") ||
    title.includes("cso") ||
    title.includes("chief information security") ||
    title.includes("chief security")
  ) {
    return "decision-maker";
  }

  // 3. Influencer — GRC / compliance / risk / audit / privacy / governance
  // Checked BEFORE technical-evaluator so a "Director of Compliance" doesn't
  // get pigeonholed into tech-eval.
  const INFLUENCER_TOKENS = [
    "grc",
    "compliance",
    "risk",
    "audit",
    "governance",
    "privacy",
    "data protection",
    "dpo",
  ];
  if (INFLUENCER_TOKENS.some((t) => title.includes(t))) {
    return "influencer";
  }

  // 4. End-user — IC + lead-IC operational security roles
  const END_USER_TOKENS = [
    "soc analyst",
    "security analyst",
    "security engineer",
    "incident response",
    "ir analyst",
    "threat hunter",
    "devsecops",
    "appsec",
    "application security",
    "penetration tester",
    "pentester",
    "red team",
    "blue team",
    "vulnerability management",
  ];
  if (END_USER_TOKENS.some((t) => title.includes(t))) {
    return "end-user";
  }

  // 2. Technical evaluator — VP/Director/Head + security context
  const HEAD_SENIORITY = ["vp", "director", "head", "owner", "founder", "c_suite"];
  const SEC_CONTEXT = ["security", "cyber", "infosec", "information security"];
  if (
    (HEAD_SENIORITY.includes(seniority) || /\b(vp|director|head)\b/.test(title)) &&
    SEC_CONTEXT.some((t) => title.includes(t))
  ) {
    return "technical-evaluator";
  }

  return "other";
}

// `deriveNextMove` + `NextMove` removed 2026-05-28 — Vera is intelligence,
// not outreach. The "what to say next" / "engage the X" copy generation
// belongs to a different product. See feedback memory:
// vera-is-intelligence-not-outreach.

export function deriveCveSummary(threatAlerts: unknown): CveSummary {
  const empty: CveSummary = { total: 0, kev: 0, critical: 0, high: 0, tone: "none" };
  if (!Array.isArray(threatAlerts)) return empty;

  let kev = 0, critical = 0, high = 0;
  for (const t of threatAlerts) {
    if (!t || typeof t !== "object") continue;
    const obj = t as Record<string, unknown>;
    const source = String(obj.source ?? "").toLowerCase();
    const severity = String(obj.severity ?? "").toLowerCase();
    if (source === "cisa_kev") kev += 1;
    else if (severity === "critical") critical += 1;
    else if (severity === "high") high += 1;
  }
  const total = kev + critical + high;
  if (total === 0) return empty;
  return {
    total,
    kev,
    critical,
    high,
    tone: kev > 0 ? "kev" : critical > 0 ? "critical" : "high",
  };
}
