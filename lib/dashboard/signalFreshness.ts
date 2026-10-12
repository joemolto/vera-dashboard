/**
 * Freshness guard for engine-written signals. Rule (2026-06-05):
 * NO signal older than 6 months may be surfaced as "current" anywhere
 * on the dashboard — "Why now", timelines, account hero, brief counts.
 *
 * Why this exists: PredictLeads news_events ship with a `date` field
 * that's the article publish/crawl date, not the underlying event
 * date. So a 2023 acquisition crawled today looks fresh by detected_at.
 * The actual event date is embedded in the natural-language summary
 * ("on Jul 1st '23.", "in January 2024", etc.).
 *
 * Strategy: extract years from the headline text. If every extractable
 * year is older than the current calendar year, treat as stale. This
 * is intentionally permissive — events without a year token (most
 * social, hiring, breach rows) pass through unfiltered; only events
 * that explicitly mention an old year get dropped.
 */

const YEAR_RE = /\b(19|20)(\d{2})\b|'(\d{2})\b/g;

/** Signal types whose headline IS the event description (PL news
 * projection). For these, a year token in the headline directly
 * tells us the event's date. Other signal types — especially
 * social_* — have headlines that excerpt user-generated content;
 * a year mention there is incidental ("San Diego prices since 2021")
 * and freshness comes from the post date instead. */
const NEWS_DERIVED_TYPES: ReadonlySet<string> = new Set([
  "product_launch",
  "new_partnership",
  "recent_acquisition",
  "expansion",
  "new_leadership",
  "hiring_leadership",
  "breach_mention",
  "recently_funded",
  "recent_funding",
]);

/** Returns true if the headline/summary appears to describe an event
 * from before the current calendar year. Scoped to news-derived
 * signal types (PL news projection); social signals are exempt
 * because their headlines may quote historical years incidentally. */
export function isStaleByHeadline(
  headline: string | null | undefined,
  signalType?: string | null,
): boolean {
  if (!headline) return false;
  // News-derived only. When signalType is undefined we apply the gate
  // (defensive — call sites that need scoping pass it explicitly).
  if (signalType && !NEWS_DERIVED_TYPES.has(signalType)) return false;
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  let m: RegExpExecArray | null;
  YEAR_RE.lastIndex = 0;
  while ((m = YEAR_RE.exec(headline)) !== null) {
    if (m[1] && m[2]) {
      years.push(parseInt(m[1] + m[2], 10));
    } else if (m[3]) {
      // Two-digit year like '23 — assume 20xx. Plain numbers without
      // the leading apostrophe are NOT matched (avoids treating "12
      // critical CVEs" as year 12).
      years.push(2000 + parseInt(m[3], 10));
    }
  }
  if (years.length === 0) return false;
  return years.every((y) => y < currentYear);
}
