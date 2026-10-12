type PillVariant =
  | "default"
  | "accent"
  | "warning"
  | "danger"
  | "muted"
  | "outline";

// Backend-tool names that must never appear in user-facing copy. The engine
// occasionally leaks these into free-text fields (e.g. "100 open roles
// detected by PredictLeads"). This is the defensive backstop — strip them
// at render time so a stray engine string never reaches a customer's
// dashboard. Engine-side fixes still happen on a case-by-case basis; this
// just guarantees the floor.
const BACKEND_TOOL_NAMES = [
  "PredictLeads",
  "Predict Leads",
  "predictleads",
  "Apollo",
  "Apollo.io",
  "apollo.io",
  "Jina",
  "Jina AI",
  "Tavily",
  "Findymail",
  "Apify",
  "Perplexity",
  "Sonar",
  "OpenRouter",
  "Anthropic",
];

const TOOL_NAME_PATTERNS = BACKEND_TOOL_NAMES.map(
  (n) =>
    new RegExp(
      // Match "by <Tool>", "via <Tool>", "from <Tool>", "(<Tool>)", or " — <Tool>"
      `(?:\\s+(?:by|via|from|using|powered by)\\s+|\\s*\\(\\s*|\\s*—\\s*)${n.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}(?:\\s*\\))?`,
      "gi",
    ),
);

/**
 * Strip references to backend tool names from a user-facing string.
 * Use everywhere a free-text engine output is rendered on the dashboard.
 */
export function scrubBackendNames(text: string | null | undefined): string {
  if (!text) return "";
  let cleaned = text;
  for (const re of TOOL_NAME_PATTERNS) cleaned = cleaned.replace(re, "");
  // Collapse double spaces / orphan punctuation left after stripping
  return cleaned
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .trim();
}

const STATUS_VARIANTS: Record<string, PillVariant> = {
  new: "default",
  qualified: "accent",
  disqualified: "muted",
  sequenced: "outline",
  replied: "accent",
  meeting: "accent",
  closed: "accent",
  dead: "muted",
  parked: "warning",
  bounced: "danger",
  archived: "muted",
};

export function statusPillVariant(status: string | null | undefined): PillVariant {
  if (!status) return "muted";
  return STATUS_VARIANTS[status.toLowerCase()] ?? "default";
}

const DATA_STATUS_LABELS: Record<string, string> = {
  verified: "Verified",
  unverified: "Unverified",
  ambiguous: "Ambiguous",
  side_role: "Side role",
  stale: "Stale",
  no_linkedin: "No LinkedIn",
};

export function dataStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return DATA_STATUS_LABELS[status.toLowerCase()] ?? status;
}

export function dataStatusVariant(
  status: string | null | undefined,
): PillVariant {
  if (!status) return "muted";
  const s = status.toLowerCase();
  if (s === "verified") return "accent";
  if (s === "side_role" || s === "ambiguous") return "warning";
  if (s === "stale" || s === "no_linkedin") return "danger";
  return "muted";
}

// Acronyms / brand names that need specific casing when humanising
// snake_case identifiers. Without this list, "ciso" would become "Ciso"
// and "soc2" → "Soc2". Order matters — longer matches first so
// "linkedin" wins over "linked".
const ACRONYMS = [
  "CISO", "CTO", "CIO", "CEO", "COO", "CRO", "CMO", "CFO",
  "VP", "MDR", "SOC", "SOC2", "EDR", "XDR", "SIEM", "GRC",
  "ICP", "KEV", "CVE", "CVSS", "NDR", "DLP", "IAM",
  "API", "SDK", "MCP", "URL", "IP", "DNS", "VPN", "MFA",
  "SaaS", "PaaS", "IaaS", "AWS", "GCP", "PII", "GDPR",
  "HIPAA", "PCI", "ISO", "NIST",
  "LinkedIn", "GitHub", "X", "B2B", "B2C",
];

const ACRONYM_LOOKUP = new Map(ACRONYMS.map((a) => [a.toLowerCase(), a]));

/**
 * Turn a snake_case / kebab-case engine identifier into a clean,
 * title-cased label safe for the UI. Rule: no
 * underscores or code-looking text in customer-facing copy.
 *
 * Examples:
 *   "social_breach_mention" → "Social Breach Mention"
 *   "computer_software"     → "Computer Software"
 *   "head_of_ciso"          → "Head Of CISO"
 *   "person_engaged_with_competitor" → "Person Engaged With Competitor"
 *
 * For specific known signal_types prefer signalTypeLabel() which
 * returns sales-facing prose ("Breach mention" not "Social Breach
 * Mention"). Use humanizeLabel for unknown / catch-all cases.
 */
export function humanizeLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => {
      const lower = word.toLowerCase();
      // Acronym / brand-name lookup first
      const acr = ACRONYM_LOOKUP.get(lower);
      if (acr) return acr;
      // Standard title-case (preserves any existing mixed case in the
      // middle of the word for things like "iPhone")
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/**
 * Canonical UI labels for engine signal_types. Anything missing here
 * falls back through humanizeLabel(). Keep this in sync with
 * KNOWN_SIGNAL_TYPES in the engine's signal_writer.py.
 *
 * Labels use sentence case (one capital, rest lower) because they
 * read better in dense lists than title-cased equivalents.
 */
const SIGNAL_TYPE_LABELS: Record<string, string> = {
  // Account / PL news
  recent_acquisition: "Acquisition",
  recently_funded: "Funding round",
  product_launch: "Product launch",
  new_partnership: "New partnership",
  new_leadership: "New leadership",
  expansion: "Expansion",
  // Hiring
  hiring_sales_bd: "Sales / BD hiring",
  hiring_security: "Security hiring",
  hiring_grc: "GRC hiring",
  // Cyber correlation
  security_leadership_hire: "New security leader",
  security_team_expansion: "Security team scaling",
  cve_in_stack: "CVE in stack",
  compliance_gap: "Compliance gap",
  breach_proximity: "Peer breach",
  credential_leak: "Credentials in stealer logs",
  credential_leak_supply_chain: "Supply-chain credential exposure",
  // Person
  person_new_in_role: "Buyer new in role",
  person_promoted: "Promoted",
  person_changed_company: "Changed company",
  person_security_leader: "Security leader",
  person_grc_leader: "GRC leader",
  person_technical_leader: "Technical leader",
  person_commercial_leader: "Commercial leader",
  person_prior_vendor_experience: "Prior vendor experience",
  person_active_linkedin: "Active on LinkedIn",
  person_posted_relevant_topic: "Buyer posted on topic",
  person_engaged_with_topic: "Buyer engaged with topic",
  person_engaged_with_competitor: "Buyer engaged with competitor",
  // Job-keyword
  job_mentions_soc2: "Job mentions SOC2",
  job_mentions_iso27001: "Job mentions ISO 27001",
  job_mentions_security_questionnaires: "Job mentions security questionnaires",
  job_mentions_vendor_risk: "Job mentions vendor risk",
  job_mentions_audit: "Job mentions audit",
  job_mentions_cloud_security: "Job mentions cloud security",
  job_mentions_identity: "Job mentions identity",
  job_mentions_siem: "Job mentions SIEM",
  job_mentions_edr: "Job mentions EDR",
  job_mentions_vuln_mgmt: "Job mentions vuln mgmt",
  job_mentions_incident_response: "Job mentions incident response",
  job_mentions_devsecops: "Job mentions DevSecOps",
  // Pressure rollups
  compliance_workflow_pressure: "Compliance workflow pressure",
  security_operations_pressure: "Security operations pressure",
  cloud_security_pressure: "Cloud security pressure",
  appsec_pressure: "AppSec pressure",
  enterprise_trust_pressure: "Enterprise trust pressure",
  // Website / posture
  trust_center_present: "Trust center",
  security_page_present: "Security page",
  compliance_page_present: "Compliance page",
  privacy_page_present: "Privacy page",
  dpa_present: "DPA",
  subprocessors_present: "Subprocessors page",
  status_page_present: "Status page",
  responsible_disclosure_present: "Responsible disclosure",
  bug_bounty_present: "Bug bounty",
  security_contact_present: "Security contact",
  certification_claim_detected: "Certification claim",
  certification_iso_27001: "ISO 27001 claimed",
  certification_soc_2: "SOC 2 claimed",
  certification_pci_dss: "PCI-DSS claimed",
  certification_cyber_essentials: "Cyber Essentials claimed",
  certification_cyber_essentials_plus: "Cyber Essentials Plus claimed",
  certification_crest: "CREST claimed",
  certification_check: "CHECK claimed",
  public_proof_not_visible: "Public proof not visible",
  enterprise_page_detected: "Enterprise page",
  api_or_developer_platform: "API / developer platform",
  // Customer / market
  enterprise_customer_detected: "Enterprise customer detected",
  regulated_customer_detected: "Regulated customer detected",
  public_sector_customer_detected: "Public sector customer detected",
  // Compound cyber-pressure
  enterprise_readiness_pressure: "Enterprise readiness pressure",
  customer_security_review_pressure: "Customer security review pressure",
  post_funding_security_maturity_push: "Post-funding security push",
  upmarket_security_friction: "Upmarket security friction",
  compliance_operationalisation: "Compliance operationalisation",
  security_team_scaling: "Security team scaling",
  cloud_security_scaling: "Cloud security scaling",
  revenue_blocker_likely: "Revenue blocker likely",
  // Social listening
  social_company_mention: "Company mention",
  social_company_post: "Company post",
  social_employee_chatter: "Employee chatter",
  social_breach_mention: "Breach mention",
  social_hiring_buzz: "Hiring buzz",
  social_complaint: "Customer complaint",
  social_customer_review: "Customer review",
  social_vendor_relationship: "Vendor relationship",
  social_funding_news: "Funding news",
  social_leadership_change: "Leadership change",
  social_milestone: "Milestone",
};

export function signalTypeLabel(signalType: string | null | undefined): string {
  if (!signalType) return "";
  return SIGNAL_TYPE_LABELS[signalType] ?? humanizeLabel(signalType);
}

/** Route a LinkedIn/Apollo photo URL through our avatar proxy so it
 * renders in the browser (LinkedIn's CDN blocks cross-origin hotlinks).
 * Pass-through for anything already same-origin or empty. */
export function proxiedAvatar(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/")) return url;
  return `/api/avatar?url=${encodeURIComponent(url)}`;
}

// Short chip variants of the social signal labels, for compact surfaces
// (account rows, drawer chips) where the full SIGNAL_TYPE_LABELS form
// doesn't fit. Kept in sync with the engine-side classifier
// (engine: app/services/social_intent.py).
export const SOCIAL_CHIP_LABELS: Record<string, string> = {
  social_breach_mention: "Breach",
  social_leadership_change: "Leadership",
  social_funding_news: "Funding",
  social_milestone: "Milestone",
  social_employee_chatter: "Employee",
  social_company_post: "Company post",
  social_hiring_buzz: "Hiring",
  social_vendor_relationship: "Vendor stack",
  social_complaint: "Complaint",
  social_customer_review: "Review",
  social_company_mention: "Mention",
};

export const ACTIVITY_LABELS: Record<string, string> = {
  lead_sourced: "Lead sourced",
  lead_enriched: "Lead enriched",
  lead_scored: "Lead scored",
  lead_sequenced: "Lead sequenced",
  threat_alert: "Threat alert",
  watchlist_monitoring_run: "Watchlist scan",
  watchlist_remove: "Watchlist removal",
  vera_brain_proactive: "Vera brain · proactive",
  vera_brain_reactive: "Vera brain · reactive",
  vera_brain_tool_call: "Vera brain · tool",
  vera_data_flag: "Data flag",
  vera_auto_watchlist: "Auto-added to watchlist",
  reply_classified: "Reply classified",
  signal_detected: "Signal detected",
  status_updated: "Status updated",
  stats_synced: "Campaign stats synced",
  email_bounced: "Email bounced",
  lead_unsubscribed: "Lead unsubscribed",
};
