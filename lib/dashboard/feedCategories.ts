export interface FeedCategory {
  key: string;
  label: string;
  icon: string;
  alert_types: string[];
}

export const ALL_ALERT_TYPES = [
  "news_funding",
  "news_acquisition",
  "news_hiring",
  "news_product_launch",
  "news_breach",
  "news_ransomware",
  "news_vulnerability",
  "news_enforcement",
  "news_other",
  "threat_relevant",
  "tech_stack_added",
  "tech_stack_removed",
  "new_job_posting",
  "new_blog_post",
  "hiring_security",
  "hiring_leadership",
  "website_change",
  "contact_activity",
  "perplexity_partnership",
  "perplexity_product_launch",
  "perplexity_event",
  "perplexity_office_expansion",
];

const DEFAULT: FeedCategory[] = [
  { key: "all_alerts", label: "All Alerts", icon: "🔔", alert_types: ALL_ALERT_TYPES },
];

/**
 * Reference set of curated feed categories. Not applied to any org by
 * the dashboard — orgs that want this layout should set the same JSON
 * on organisations.icp_config.feed_categories on the engine side. The
 * dashboard is org-agnostic; per-org customization lives in the engine.
 */
export const CURATED_RECOMMENDATION: FeedCategory[] = [
  {
    key: "buying_signals",
    label: "Buying signals",
    icon: "📈",
    alert_types: [
      "news_funding",
      "news_acquisition",
      "news_hiring",
      "news_product_launch",
    ],
  },
  {
    key: "account_news",
    label: "Account news",
    icon: "📰",
    alert_types: [
      "new_blog_post",
      "perplexity_partnership",
      "perplexity_event",
      "perplexity_office_expansion",
      "website_change",
    ],
  },
  {
    key: "watchlist_changes",
    label: "Watchlist",
    icon: "👀",
    alert_types: [
      "tech_stack_added",
      "tech_stack_removed",
      "contact_activity",
      "new_job_posting",
      "hiring_security",
      "hiring_leadership",
    ],
  },
];

export function resolveFeedCategories(
  icpConfig: { feed_categories?: FeedCategory[] } | null | undefined,
  _orgId: string | null | undefined,
): FeedCategory[] {
  const cats = icpConfig?.feed_categories;
  if (Array.isArray(cats) && cats.length > 0) return cats;
  return DEFAULT;
}
