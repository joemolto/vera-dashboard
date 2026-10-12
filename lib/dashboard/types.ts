export interface Lead {
  id: string;
  org_id: string | null;
  email: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company_name: string | null;
  company_domain: string | null;
  company_size: string | null;
  company_industry: string | null;
  company_location: string | null;
  linkedin_url: string | null;
  photo_url: string | null;
  total_score: string | number | null;
  signal_score: string | number | null;
  icp_score: string | number | null;
  signal_count: number | null;
  status: string | null;
  lead_rating: string | null;
  enrichment_status: string | null;
  recommended_action: string | null;
  best_approach_angle: string | null;
  rating_reason: string | null;
  signals: unknown[] | null;
  buying_signals: unknown[] | null;
  source: string | null;
  suggestion_reason: string | null;
  email_confidence: number | null;
  data_status: string | null;
  data_status_note: string | null;
  enrichment_data: EnrichmentData | null;
  /** Denormalised top-level copy of the per-lead revenue-potential
   * estimate (migration 021). NULL when no estimate (e.g. the client
   * has no average deal size configured) — UI must render nothing then. */
  revenue_potential: RevenuePotential | null;
  /** Denormalised top signal headlines (migration 022), lever-ordered.
   * NULL/empty when the lead has no findings — render nothing then. */
  signal_summary: string[] | null;
  /** Denormalised estimate of the PROSPECT COMPANY's own annual revenue
   * (migration 023) — a firmographic, distinct from revenue_potential
   * (deal value to us). NULL when unknown — render nothing then. */
  company_revenue: CompanyRevenue | null;
  created_at: string | null;
  updated_at: string | null;
  scored_at: string | null;
  enriched_at: string | null;
  first_hot_at: string | null;
  outreach_at: string | null;
  /** Per-person monitoring flag (migration 032). true = Vera watches this
   *  person weekly (role change, posts, competitor engagement). The Solo
   *  "People watched" cap counts these. Optional for backwards-compat. */
  person_monitoring?: boolean;
}

/** Deterministic account commercial-upside estimate (engine
 * revenue_potential service). Numbers are estimates, never a forecast;
 * estimated_revenue_potential is null when there's no client baseline. */
export interface RevenuePotential {
  estimated_revenue_potential: number | null;
  range_low: number | null;
  range_high: number | null;
  currency: string;
  confidence: string;
  deal_size_band?: string;
  expansion_potential?: string;
  sales_cycle_complexity?: string;
  why_this_value?: string[];
  assumptions?: string[];
  recommended_commercial_angle?: string;
}

/** The prospect company's own estimated annual revenue (firmographic).
 * `printed` is always present when the object exists — render it
 * verbatim. NOT a forecast; NOT revenue_potential. */
export interface CompanyRevenue {
  amount: number | null;
  printed: string | null;
  source: "apollo" | "research";
}

export interface EnrichmentData {
  gtm_briefing?: GtmBriefing;
  revenue_potential?: RevenuePotential;
  tech_stack?: TechStackPayload;
  news?: NewsPayload;
  predictleads_financing?: { rounds?: FundingRound[]; source?: string };
  deep_research?: DeepResearch;
  /** Merged business-intel block. The engine populates this from Apollo's
   * organizations/enrich response (revenue, funding, founded year, headcount
   * growth), with any non-empty Sonar-derived fields layered on top. Use
   * this as the canonical "company facts" source on the dashboard. */
  business_intel?: BusinessIntel;
  jobs?: JobsPayload;
  website?: WebsiteIntel;
  email_resolution?: { confidence?: number; email?: string; source?: string };
  linkedin_content?: Record<string, unknown>;
  changes_since_last?: Record<string, unknown>;
  threat_alerts?: ThreatAlertOnLead[];
  enriched_at?: string;
  enrichment_sources_run?: string[];
}

/** Canonical company-level facts. The engine merges Apollo (definitive on
 * revenue / funding events / headcount growth) with Perplexity Sonar
 * (better on key_customers / awards / qualitative). Fields are optional —
 * not every company has funding data, etc. */
export interface BusinessIntel {
  name?: string;
  founded_year?: number | string;
  estimated_num_employees?: number;
  /** Numeric annual revenue in USD where available. */
  annual_revenue?: number;
  /** Human-readable form e.g. "693M". Prefer this for display. */
  annual_revenue_printed?: string;
  total_funding?: number;
  total_funding_printed?: string;
  latest_funding_round_date?: string;
  latest_funding_stage?: string;
  funding_events?: Array<{
    amount?: number | string;
    amount_printed?: string;
    round?: string;
    date?: string;
    currency?: string;
  }>;
  publicly_traded_symbol?: string;
  publicly_traded_exchange?: string;
  industry?: string;
  headcount_six_month_growth?: number;
  headcount_twelve_month_growth?: number;
  short_description?: string;
  // Sonar-side fields (preserved when merged in by the engine)
  competitors?: string[];
  key_customers?: string[];
  recent_awards?: string[];
  estimated_revenue?: string;
  source?: string;
}

/** Output of the website enricher (Jina + Claude over the prospect's site).
 * Most fields are optional because Claude returns null/empty when the page
 * content didn't reveal that signal. */
export interface WebsiteIntel {
  company_type?: string | null;
  services_offered?: string[];
  target_industries_mentioned?: string[];
  target_buyer_personas_mentioned?: string[];

  // Customer / proven-ICP signals
  has_case_studies?: boolean;
  number_of_case_studies?: number;
  case_study_industries?: string[];
  case_study_clients?: string[];
  has_testimonials?: boolean;
  client_logos_visible?: boolean;
  named_clients?: string[];
  has_partner_page?: boolean;
  partner_names?: string[];

  // Compliance / trust posture
  has_trust_centre?: boolean;
  certifications_mentioned?: string[];
  compliance_frameworks?: string[];

  // GTM maturity
  has_sales_team_indicators?: boolean;
  has_dedicated_sales_page?: boolean;
  has_pricing_page?: boolean;
  has_demo_or_contact_form?: boolean;
  has_blog?: boolean;
  blog_post_frequency?: string | null;
  has_careers_page?: boolean;
  open_roles_mentioned?: string[];
  hiring_sales_or_bd?: boolean;
  hiring_marketing?: boolean;
  estimated_gtm_maturity?: string | null;
  estimated_company_stage?: string | null;

  // Tone / positioning — gold for opening lines
  differentiator_claims?: string[];
  pain_point_language_used?: string[];
  notes?: string | null;

  // Internal — pages we successfully scraped (set by the enricher)
  _pages_scraped?: string[];
}

export interface ThreatAlertOnLead {
  title: string;
  ai_summary?: string;
  why_relevant?: string;
  sales_angle?: string;
  matched_technologies?: string[];
  severity?: "critical" | "high" | "medium" | "low" | string;
  urgency?: "high" | "medium" | "low" | string;
  threat_type?: string;
  source?: string;
  url?: string;
  published_at?: string;
  is_actively_exploited?: boolean;
}

export interface GtmBriefing {
  intelligence_summary?: string;
  buying_readiness?: string;
  confidence_level?: string;
  recommended_play?: {
    play_name?: string;
    description?: string;
    pitch?: string;
    reasoning?: string;
    timing?: string;
    opening_line?: string;
  };
  plays_considered?: { play: string; rejected_because: string }[];
  what_we_know?: { signal: string; source: string; confidence: string }[];
  what_we_detected?: {
    date: string;
    signal: string;
    source: string;
    confidence: string;
  }[];
  signals_detected?: Record<string, boolean>;
  gaps?: { question: string; why_it_matters: string }[];
  email_drafts?: Partial<Record<EmailTone, EmailDraft>>;
  revenue_potential?: RevenuePotential;
  /** Rendered, no-overclaim commercial block (engine _commercial_section). */
  commercial?: {
    upside?: string;
    why?: string;
    positioning?: string;
    caveats?: string[];
    strongest_findings?: string[];
  };
  generated_at?: string;
}

export type EmailTone = "direct" | "formal" | "informal" | "humour" | "curiosity";

export interface EmailDraft {
  subject: string;
  body: string;
}

export interface TechItem {
  name: string;
  category?: string | null;
  source?: string | null;
  behind_firewall?: boolean;
}

export interface TechStackPayload {
  technologies_detected?: TechItem[];
  total_detected?: number;
  behind_firewall_count?: number;
  behind_firewall_techs?: TechItem[];
  crm_tools?: TechItem[];
  development_tools?: TechItem[];
  security_tools?: TechItem[];
  domain?: string;
  tech_stack_source?: string;
}

export interface NewsStory {
  date?: string;
  source?: string;
  category?: string;
  headline: string;
  product?: string;
  url?: string;
  summary?: string;
}

export interface NewsPayload {
  key_stories?: NewsStory[];
  has_recent_funding?: boolean;
  has_recent_acquisition?: boolean;
  has_recent_partnership?: boolean;
  has_recent_product_launch?: boolean;
  news_found?: boolean | number;
  source?: string;
}

export interface FundingRound {
  type?: string;
  amount?: string | number;
  date?: string;
  investors?: string[];
}

export interface DeepResearch {
  compliance?: Record<string, string | string[] | null>;
  business_intel?: {
    competitors?: string[];
    founded_year?: string;
    key_customers?: string[];
    recent_awards?: string[];
    estimated_revenue?: string;
  };
  growth_signals?: Record<string, unknown>;
  security_posture?: Record<string, unknown>;
  notes?: string;
  source?: string;
}

export interface JobsPayload {
  hiring_velocity?: string;
  hiring_velocity_notes?: string;
  is_hiring_sales_bd?: boolean;
  is_hiring_leadership?: boolean;
  is_hiring_technical?: boolean;
  total_roles_found?: number;
  source?: string;
}

export interface UsageStatus {
  tier: string;
  month: string;
  enrichments_used: number;
  enrichments_limit: number;
  remaining: number;
  pct_used: number;
  resets_on: string;
}

export interface Signal {
  id: string;
  org_id: string | null;
  lead_id: string | null;
  company_id?: string | null;
  signal_type: string;
  signal_source: string | null;
  signal_data: Record<string, unknown> | null;
  signal_strength: string | number | null;
  detected_at: string | null;
}

/** Signal augmented with a per-client relevance score (0..1). Returned by
 * the get_scored_signals RPC for orgs with icp_config.signal_priorities
 * configured. Sorted by vera_score DESC server-side. */
export interface ScoredSignal extends Signal {
  vera_score: number;
}

export interface ThreatIntel {
  id: string;
  source: string;
  source_id: string | null;
  title: string;
  description: string | null;
  severity: string | null;
  url: string | null;
  published_at: string | null;
  ai_summary: string | null;
  affected_industries: string[] | null;
  affected_technologies: string[] | null;
  affected_vendors: string[] | null;
  fetched_at: string | null;
}

export interface ThreatAlert {
  id: string;
  org_id: string | null;
  threat_intel_id: string | null;
  relevance_reason: string;
  sales_angle: string | null;
  suggested_outreach: string | null;
  content_hook: string | null;
  urgency: string | null;
  status: string | null;
  detected_at: string | null;
  seen_at: string | null;
  actioned_at: string | null;
  threat_intel?: ThreatIntel | null;
}

export interface WatchlistCompany {
  id: string;
  org_id: string | null;
  company_name: string;
  company_domain: string;
  target_contact_name: string | null;
  target_contact_title: string | null;
  target_contact_linkedin: string | null;
  notes: string | null;
  priority: string | null;
  monitoring_active: boolean | null;
  last_monitored_at: string | null;
  next_monitor_at: string | null;
  lead_id: string | null;
  created_at: string | null;
  /** Market this account belongs to (054). NULL/absent = primary market. */
  market_id?: string | null;
}

export interface WatchlistAlert {
  id: string;
  org_id: string | null;
  watchlist_id: string | null;
  alert_type: string;
  alert_title: string;
  alert_summary: string;
  suggested_action: string | null;
  approach_angle: string | null;
  urgency: string | null;
  status: string | null;
  detected_at: string | null;
}

export interface ActivityEntry {
  id: string;
  org_id: string | null;
  lead_id: string | null;
  activity_type: string;
  activity_data: Record<string, unknown> | null;
  created_at: string | null;
}

export interface Organisation {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  tier: string | null;
  /** Billing plan id. Diverges from `tier` on custom deals (e.g. an org
   * monitored on the caps pipeline but billed as scout). */
  subscription_tier: string | null;
  monthly_enrichment_limit: number | null;
  created_at: string | null;
}
