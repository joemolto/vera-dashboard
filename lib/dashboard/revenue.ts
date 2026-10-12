import type { CompanyRevenue, RevenuePotential } from "@/lib/dashboard/types";

const CURRENCY_SYMBOL: Record<string, string> = {
  GBP: "£",
  USD: "$",
  EUR: "€",
};

function symbol(currency: string | undefined): string {
  const c = (currency ?? "GBP").toUpperCase();
  return CURRENCY_SYMBOL[c] ?? `${c} `;
}

/**
 * Sensible default currency when an org hasn't picked one, derived from its
 * target geography: GBP only when the seller targets the UK exclusively,
 * USD otherwise (our pricing is USD and it's the common case). The home
 * dashboard and Settings both use this so a null currency can never render
 * as £ in one place and $ in another.
 */
export function defaultCurrency(locations?: string[] | null): string {
  const locs = (locations ?? [])
    .map((l) => (typeof l === "string" ? l.toLowerCase() : ""))
    .filter(Boolean);
  if (locs.length === 0) return "USD";
  const isUK = (l: string) =>
    l.includes("united kingdom") ||
    /\buk\b/.test(l) ||
    l.includes("britain") ||
    l.includes("england") ||
    l.includes("scotland") ||
    l.includes("wales") ||
    l.includes("northern ireland");
  return locs.every(isUK) ? "GBP" : "USD";
}

/** Compact money: 63000 -> "63k", 1500 -> "1.5k", 850 -> "850". */
function compact(n: number): string {
  if (n < 1000) return String(Math.round(n));
  const k = n / 1000;
  return (k < 10 ? k.toFixed(1).replace(/\.0$/, "") : String(Math.round(k))) + "k";
}

export interface RevenueDisplay {
  estimate: string; // e.g. "£63k"
  range: string | null; // e.g. "£41–85k"
  confidence: string | null; // e.g. "high"
}

/**
 * Display strings for a lead's revenue potential, or `null` when there
 * is no real estimate (no client baseline / unconfigured org). Callers
 * must render nothing on null — keeps the feature org-agnostic.
 */
export function revenueDisplay(
  rp: RevenuePotential | null | undefined,
): RevenueDisplay | null {
  const est = rp?.estimated_revenue_potential;
  if (rp == null || est == null || est <= 0) return null;
  const sym = symbol(rp.currency);
  const lo = rp.range_low;
  const hi = rp.range_high;
  return {
    estimate: `${sym}${compact(est)}`,
    range:
      lo != null && hi != null ? `${sym}${compact(lo)}–${compact(hi)}` : null,
    confidence: rp.confidence ?? null,
  };
}

/**
 * Display string for the prospect company's own annual revenue, or
 * `null` when unknown. The engine always supplies a ready `printed`
 * string ("$40M", "$10M-$50M"), so this just guards null — callers
 * render nothing on null, keeping the column org-agnostic.
 */
export function companyRevenueDisplay(
  cr: CompanyRevenue | null | undefined,
): string | null {
  const p = cr?.printed?.trim();
  return p ? p : null;
}
