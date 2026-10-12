/**
 * Defensive scrub for chat agent output — strips backend vendor names
 * from any assistant text before persistence. The system prompt has a
 * HARD RULE forbidding the model from naming these (see system.ts), so
 * this is the floor, not the primary defence.
 *
 * Why a chat-specific scrub: the dashboard's `scrubBackendNames` in
 * lib/dashboard/labels.ts only matches preposition-prefixed patterns
 * ("by Apollo", "via PredictLeads"). The chat agent writes free-form
 * prose where vendor names can appear anywhere — "I'll search Apollo
 * for…", "Apollo data shows…", etc. We do a stricter word-boundary
 * replacement with a generic substitute.
 */

interface VendorRule {
  // Word/phrase to detect (case-insensitive).
  needle: string;
  // What to swap it with — chosen to keep the sentence readable.
  replacement: string;
}

const VENDOR_RULES: VendorRule[] = [
  { needle: "Apollo.io", replacement: "the people directory" },
  { needle: "Apollo", replacement: "the people directory" },
  { needle: "PredictLeads", replacement: "the signal engine" },
  { needle: "Predict Leads", replacement: "the signal engine" },
  { needle: "predictleads", replacement: "the signal engine" },
  { needle: "Perplexity Sonar", replacement: "deep research" },
  { needle: "Perplexity", replacement: "deep research" },
  { needle: "Jina AI", replacement: "the website crawler" },
  { needle: "Jina", replacement: "the website crawler" },
  { needle: "Tavily", replacement: "web research" },
  { needle: "Findymail", replacement: "the email finder" },
  { needle: "Apify", replacement: "the scraper" },
  { needle: "OpenRouter", replacement: "the model gateway" },
  { needle: "Anthropic", replacement: "the model provider" },
  { needle: "CISA KEV", replacement: "the actively-exploited list" },
  { needle: "apollo_people_cache", replacement: "the people cache" },
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const COMPILED = VENDOR_RULES.map((rule) => ({
  // Word boundaries on both sides so "Apollo" matches but "polypop" doesn't.
  // Underscores/dots in the needle are handled via the escaped form.
  re: new RegExp(`\\b${escapeRegex(rule.needle)}\\b`, "gi"),
  replacement: rule.replacement,
}));

/**
 * Strip vendor names from chat agent output. Idempotent — running it
 * twice produces the same result. Safe to apply to streaming deltas
 * (won't catch names split across chunk boundaries — relies on the
 * system prompt rule as the primary defence for live streams) and to
 * fully-assembled assistant messages (catches everything before
 * persist).
 */
export function scrubChatText(text: string): string {
  if (!text) return text;
  let cleaned = text;
  for (const { re, replacement } of COMPILED) {
    cleaned = cleaned.replace(re, replacement);
  }
  // Tidy any double spaces / orphan punctuation left after substitution.
  return cleaned
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1");
}
