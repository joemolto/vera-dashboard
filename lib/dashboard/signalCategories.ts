/**
 * Canonical signal category taxonomy. Every signal_type the engine
 * writes maps to exactly one category here.
 *
 * Two consumers:
 *   1. Dashboard accounts table — the row's "Signals" cell shows chips
 *      for categories the org has enabled in
 *      icp_config.features.visible_signal_categories.
 *   2. Chat agent — signal_categories filter on search_accounts uses
 *      the same categories (see lib/chat/tools.ts).
 *
 * Adding a new signal_type? Map it to a category here OR it falls
 * through to "other_signals". Adding a new category? Pick a key,
 * label, and which types belong. Existing org prefs default to "all
 * categories" so a new category is automatically visible.
 */

export type SignalCategory =
  | "security_leadership"
  | "leadership_change"
  | "funding"
  | "acquisition"
  | "partnership"
  | "expansion"
  | "product_launch"
  | "hiring"
  | "cyber_job_intent"
  | "credential_exposure"
  | "cve_exposure"
  | "breach"
  | "tech_change"
  | "security_posture"
  | "enterprise_readiness"
  | "company_news"
  | "person_activity"
  | "social_chatter"
  | "other_signals";

interface CategoryMeta {
  key: SignalCategory;
  /** Human label shown in Settings + as the chip text. */
  label: string;
  /** One-line explanation of what's in this bucket — used in the
   *  Settings UI tooltip + the chip's title attribute. */
  description: string;
  /** Tailwind colour tone for the chip background. */
  tone: "accent" | "amber" | "rose" | "violet" | "blue" | "muted";
  /** Display order in Settings + tie-break order when ranking chips. */
  sortPriority: number;
}

export const SIGNAL_CATEGORIES: CategoryMeta[] = [
  {
    key: "security_leadership",
    label: "Security leaders",
    description: "New CISO / Head of Security / GRC leader hires or moves",
    tone: "accent",
    sortPriority: 1,
  },
  {
    key: "leadership_change",
    label: "Leadership change",
    description: "Other leadership hires, promotions, or role changes",
    tone: "accent",
    sortPriority: 2,
  },
  {
    key: "funding",
    label: "Funding",
    description: "Funding rounds, raises, post-funding security maturity",
    tone: "accent",
    sortPriority: 3,
  },
  {
    key: "acquisition",
    label: "Acquisition / M&A",
    description: "Acquired or acquiring",
    tone: "accent",
    sortPriority: 4,
  },
  {
    key: "partnership",
    label: "Partnership",
    description: "New strategic partnerships",
    tone: "violet",
    sortPriority: 5,
  },
  {
    key: "expansion",
    label: "Expansion",
    description: "Office expansion, market entry, new geographies",
    tone: "violet",
    sortPriority: 6,
  },
  {
    key: "product_launch",
    label: "Product launch",
    description: "New product / feature announcements",
    tone: "violet",
    sortPriority: 7,
  },
  {
    key: "hiring",
    label: "Hiring",
    description: "Sales / security / GRC / general hiring activity",
    tone: "blue",
    sortPriority: 8,
  },
  {
    key: "cyber_job_intent",
    label: "Cyber job intent",
    description: "Job posts mentioning specific tools or workflows (SIEM, EDR, vendor risk, audits…). Strong buying intent.",
    tone: "blue",
    sortPriority: 9,
  },
  {
    key: "credential_exposure",
    label: "Credential exposure",
    description: "Employee or supply-chain credentials found in infostealer logs / dark-web dumps. Recent employee exposure is the strongest live-risk signal.",
    tone: "rose",
    sortPriority: 9,
  },
  {
    key: "cve_exposure",
    label: "CVE exposure",
    description: "Known vulnerabilities in their detected stack. KEV = actively exploited.",
    tone: "rose",
    sortPriority: 10,
  },
  {
    key: "breach",
    label: "Breach activity",
    description: "Mentions of an actual breach or peer-sector breach proximity",
    tone: "rose",
    sortPriority: 11,
  },
  {
    key: "tech_change",
    label: "Tech stack change",
    description: "Tech added or removed from their stack",
    tone: "blue",
    sortPriority: 12,
  },
  {
    key: "security_posture",
    label: "Security posture",
    description: "Visible trust pages, compliance pages, SOC 2 / ISO claims, status pages",
    tone: "muted",
    sortPriority: 13,
  },
  {
    key: "enterprise_readiness",
    label: "Enterprise readiness",
    description: "Enterprise customers, regulated customers, API platform, upmarket signals",
    tone: "muted",
    sortPriority: 14,
  },
  {
    key: "company_news",
    label: "Company news",
    description: "Generic news, blog posts, website changes not covered above",
    tone: "muted",
    sortPriority: 15,
  },
  {
    key: "person_activity",
    label: "Person activity",
    description: "Watched contacts posting on LinkedIn or engaging with relevant topics",
    tone: "muted",
    sortPriority: 16,
  },
  {
    key: "social_chatter",
    label: "Social chatter",
    description:
      "Mentions of the account or your keywords on Reddit, LinkedIn posts, Twitter/X, or forums — the social conversation layer that PR / news feeds miss",
    tone: "violet",
    sortPriority: 17,
  },
  {
    key: "other_signals",
    label: "Other signals",
    description: "Anything not in the above categories — catch-all so nothing is silently dropped.",
    tone: "muted",
    sortPriority: 18,
  },
];

export const SIGNAL_CATEGORY_BY_KEY: Record<SignalCategory, CategoryMeta> =
  Object.fromEntries(SIGNAL_CATEGORIES.map((c) => [c.key, c])) as Record<
    SignalCategory,
    CategoryMeta
  >;

/**
 * Map every known signal_type to a category. Anything not in this map
 * falls through to "other_signals" via classifyType() so we don't
 * silently drop signals. When adding a signal_type to the engine,
 * add a row here too.
 *
 * Source: app/services/signal_writer.py KNOWN_SIGNAL_TYPES on the
 * engine side, mirrored here.
 */
const TYPE_TO_CATEGORY: Record<string, SignalCategory> = {
  // Security leadership
  security_leadership_hire: "security_leadership",
  person_security_leader: "security_leadership",
  person_grc_leader: "security_leadership",

  // General leadership
  new_leadership: "leadership_change",
  person_new_in_role: "leadership_change",
  person_promoted: "leadership_change",
  person_changed_company: "leadership_change",
  person_technical_leader: "leadership_change",
  person_commercial_leader: "leadership_change",
  hiring_leadership: "leadership_change",

  // Funding
  recently_funded: "funding",
  funding_round: "funding",
  post_funding_security_maturity_push: "funding",

  // M&A
  recent_acquisition: "acquisition",
  acquisition: "acquisition",

  // Partnership
  new_partnership: "partnership",
  partnership: "partnership",

  // Expansion
  expansion: "expansion",

  // Product launch
  product_launch: "product_launch",

  // Hiring (general)
  security_team_expansion: "hiring",
  hiring_sales_bd: "hiring",
  hiring_security: "hiring",
  hiring_grc: "hiring",
  hiring_sales: "hiring",
  new_job_posting: "hiring",
  security_team_scaling: "hiring",
  cloud_security_scaling: "hiring",

  // Cyber job intent — JD content mentions specific cyber tooling / workflows
  job_mentions_security_questionnaires: "cyber_job_intent",
  job_mentions_vendor_risk: "cyber_job_intent",
  job_mentions_audit: "cyber_job_intent",
  job_mentions_cloud_security: "cyber_job_intent",
  job_mentions_identity: "cyber_job_intent",
  job_mentions_siem: "cyber_job_intent",
  job_mentions_edr: "cyber_job_intent",
  job_mentions_vuln_mgmt: "cyber_job_intent",
  job_mentions_incident_response: "cyber_job_intent",
  job_mentions_devsecops: "cyber_job_intent",

  // Credential exposure (stealer logs / dark web)
  credential_leak: "credential_exposure",
  credential_leak_supply_chain: "credential_exposure",

  // CVEs
  cve_in_stack: "cve_exposure",

  // Breach
  breach_proximity: "breach",
  breach_mention: "breach",

  // Tech change
  tech_stack_added: "tech_change",
  tech_stack_removed: "tech_change",

  // Security posture (presence signals)
  trust_center_present: "security_posture",
  security_page_present: "security_posture",
  compliance_page_present: "security_posture",
  privacy_page_present: "security_posture",
  dpa_present: "security_posture",
  subprocessors_present: "security_posture",
  status_page_present: "security_posture",
  responsible_disclosure_present: "security_posture",
  bug_bounty_present: "security_posture",
  security_contact_present: "security_posture",
  certification_claim_detected: "security_posture",
  public_proof_not_visible: "security_posture",

  // Enterprise readiness
  enterprise_page_detected: "enterprise_readiness",
  api_or_developer_platform: "enterprise_readiness",
  enterprise_customer_detected: "enterprise_readiness",
  regulated_customer_detected: "enterprise_readiness",
  public_sector_customer_detected: "enterprise_readiness",
  enterprise_readiness_pressure: "enterprise_readiness",
  customer_security_review_pressure: "enterprise_readiness",
  upmarket_security_friction: "enterprise_readiness",
  compliance_workflow_pressure: "enterprise_readiness",
  compliance_operationalisation: "enterprise_readiness",
  security_operations_pressure: "enterprise_readiness",
  cloud_security_pressure: "enterprise_readiness",
  appsec_pressure: "enterprise_readiness",
  enterprise_trust_pressure: "enterprise_readiness",
  revenue_blocker_likely: "enterprise_readiness",

  // Company news (generic)
  predictleads_news: "company_news",
  website_change: "company_news",
  new_blog_post: "company_news",

  // Person activity
  person_active_linkedin: "person_activity",
  person_posted_relevant_topic: "person_activity",
  person_prior_vendor_experience: "person_activity",
  contact_activity: "person_activity",

  // Social chatter — from the new API Direct social listener (Reddit
  // posts, LinkedIn posts, Twitter/X, forums). All four channels land
  // in the same category so a single chip surfaces "someone talked
  // about this account / topic somewhere social" without forcing the
  // rep to remember which platform.
  reddit_mention: "social_chatter",
  reddit_comment_mention: "social_chatter",
  linkedin_post_mention: "social_chatter",
  twitter_mention: "social_chatter",
  forum_mention: "social_chatter",
};

export function classifyType(signal_type: string | null | undefined): SignalCategory {
  if (!signal_type) return "other_signals";
  return TYPE_TO_CATEGORY[signal_type] ?? "other_signals";
}

/** All category keys — handy for "default = show all" logic. */
export const ALL_CATEGORY_KEYS: SignalCategory[] = SIGNAL_CATEGORIES.map(
  (c) => c.key,
);
