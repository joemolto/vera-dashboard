/**
 * Per-account revenue potential — TypeScript port of the engine's
 * estimate_revenue_potential() from app/services/revenue_potential.py.
 *
 * Account-level slice (no per-person seniority multiplier, since the
 * accounts table doesn't pivot on a single contact). Math otherwise
 * matches the engine so the numbers are consistent across surfaces.
 *
 * Deterministic. No LLM. Never returns fake precision — bands of $500
 * for small, $5K for mid, $25K for enterprise.
 */

export interface AccountPotentialInput {
  baseline: number;           // client_context.average_deal_size
  currency: string;           // "USD" / "GBP" / "EUR"
  highValueSegments?: string[]; // industries this client over-indexes on
  lowValueSegments?: string[];
  enterpriseThresholdEmployees?: number | null;
  minDeal?: number | null;
  maxDeal?: number | null;

  // Account inputs
  sizeBand: string | null;    // companies.size_band — e.g. "660" or "1001-5000"
  industry: string | null;    // companies.industry
  signalCount: number;        // total signals last 90d (proxy for activity)
  growthSignalCount: number;  // funding / acquisition / hiring / expansion
  cyberFindingCount: number;  // CVE / breach / compliance / sec-team / sec-lead
}

export interface AccountPotentialResult {
  estimate: number;           // rounded USD/GBP/EUR figure
  rangeLow: number;
  rangeHigh: number;
  currency: string;
  confidence: "high" | "medium" | "low" | "unknown";
  band: "below_baseline" | "baseline" | "mid_market" | "enterprise" | "unknown";
  reasoning: string[];
}

const REGULATED = [
  "financial", "fintech", "bank", "insurance", "health", "healthcare",
  "pharma", "government", "defense", "defence", "energy", "utilit",
  "legal", "telecom",
];

const MULT_FLOOR = 0.5;
const MULT_CEIL = 3.0;

function clamp(v: number, lo = MULT_FLOOR, hi = MULT_CEIL): number {
  return Math.max(lo, Math.min(hi, v));
}

function parseEmployeeCount(sizeBand: string | null): number | null {
  if (!sizeBand) return null;
  const s = String(sizeBand).trim().toLowerCase().replace(/,/g, "");
  if (!s) return null;
  const nums = (s.match(/\d+/g) ?? []).map(Number).filter((n) => !isNaN(n));
  if (nums.length === 0) return null;
  if (nums.length >= 2) return Math.floor((nums[0] + nums[1]) / 2);
  return nums[0];
}

function sizeMultiplier(
  emp: number | null,
  enterpriseThreshold: number | null,
): { mult: number; reason: string } {
  if (emp == null) return { mult: 1.0, reason: "Company size unknown" };
  if (enterpriseThreshold && emp >= enterpriseThreshold)
    return { mult: 2.2, reason: `Enterprise account (~${emp} employees)` };
  if (emp < 10) return { mult: 0.6, reason: `Very small company (~${emp} employees)` };
  if (emp < 50) return { mult: 0.8, reason: `Small company (~${emp} employees)` };
  if (emp < 200) return { mult: 1.0, reason: `Mid-size company (~${emp} employees)` };
  if (emp < 1000) return { mult: 1.4, reason: `Large company (~${emp} employees)` };
  if (emp < 5000) return { mult: 1.9, reason: `Major enterprise (~${emp} employees)` };
  return { mult: 2.5, reason: `Global enterprise (~${emp} employees)` };
}

function industryMultiplier(
  industry: string | null,
  highValue: string[],
  lowValue: string[],
): { mult: number; reason: string | null } {
  const ind = (industry ?? "").toLowerCase();
  if (!ind) return { mult: 1.0, reason: null };
  for (const seg of highValue) {
    if (seg && ind.includes(seg.toLowerCase()))
      return { mult: 1.3, reason: `High-value segment (${industry})` };
  }
  for (const seg of lowValue) {
    if (seg && ind.includes(seg.toLowerCase()))
      return { mult: 0.7, reason: `Lower-value segment (${industry})` };
  }
  if (REGULATED.some((k) => ind.includes(k)))
    return { mult: 1.15, reason: `Regulated industry (${industry})` };
  return { mult: 1.0, reason: null };
}

function urgencyMultiplier(growthCount: number): { mult: number; reason: string | null } {
  if (growthCount === 0) return { mult: 1.0, reason: null };
  const m = Math.min(1.4, 1.0 + 0.12 * growthCount);
  return { mult: m, reason: `${growthCount} active growth signal(s) — live window` };
}

function cyberRelevanceMultiplier(cyberCount: number): { mult: number; reason: string | null } {
  if (cyberCount === 0) return { mult: 1.0, reason: null };
  const m = Math.min(1.35, 1.0 + 0.09 * cyberCount);
  return { mult: m, reason: `${cyberCount} cyber-relevant signal(s)` };
}

function roundMoney(v: number): number {
  if (v <= 0) return 0;
  if (v < 10_000) return Math.round(v / 500) * 500;
  if (v < 100_000) return Math.round(v / 1_000) * 1_000;
  if (v < 1_000_000) return Math.round(v / 5_000) * 5_000;
  return Math.round(v / 25_000) * 25_000;
}

function band(
  estimate: number,
  baseline: number,
): AccountPotentialResult["band"] {
  if (baseline <= 0) return "unknown";
  const r = estimate / baseline;
  if (r < 0.75) return "below_baseline";
  if (r < 1.5) return "baseline";
  if (r < 3.0) return "mid_market";
  return "enterprise";
}

export function estimateAccountPotential(
  input: AccountPotentialInput,
): AccountPotentialResult | null {
  if (!input.baseline || input.baseline <= 0) return null;
  const emp = parseEmployeeCount(input.sizeBand);

  const size = sizeMultiplier(emp, input.enterpriseThresholdEmployees ?? null);
  const ind = industryMultiplier(
    input.industry,
    input.highValueSegments ?? [],
    input.lowValueSegments ?? [],
  );
  const urg = urgencyMultiplier(input.growthSignalCount);
  const cyb = cyberRelevanceMultiplier(input.cyberFindingCount);

  const combined =
    clamp(size.mult) * clamp(ind.mult) * clamp(urg.mult) * clamp(cyb.mult);

  // Confidence: count evidence axes.
  const evidence = [
    emp != null,
    !!input.industry,
    input.signalCount > 0,
    input.growthSignalCount > 0,
    input.cyberFindingCount > 0,
  ].filter(Boolean).length;

  let confidence: AccountPotentialResult["confidence"];
  let spread: number;
  let confDiscount: number;
  if (evidence >= 4) {
    confidence = "high";
    spread = 0.35;
    confDiscount = 1.0;
  } else if (evidence >= 2) {
    confidence = "medium";
    spread = 0.55;
    confDiscount = 0.95;
  } else {
    confidence = "low";
    spread = 0.8;
    confDiscount = 0.85;
  }

  const rawEstimate = input.baseline * combined * confDiscount;

  // Apply caps if configured.
  let capped = rawEstimate;
  if (input.minDeal != null) capped = Math.max(capped, input.minDeal);
  if (input.maxDeal != null) capped = Math.min(capped, input.maxDeal);

  const estimate = roundMoney(capped);
  const rangeLow = roundMoney(Math.max(input.minDeal ?? 0, capped * (1 - spread)));
  const rangeHigh = roundMoney(
    input.maxDeal != null
      ? Math.min(input.maxDeal, capped * (1 + spread))
      : capped * (1 + spread),
  );

  const reasoning: string[] = [size.reason];
  if (ind.reason) reasoning.push(ind.reason);
  if (urg.reason) reasoning.push(urg.reason);
  if (cyb.reason) reasoning.push(cyb.reason);

  return {
    estimate,
    rangeLow: Math.min(rangeLow, estimate),
    rangeHigh: Math.max(rangeHigh, estimate),
    currency: input.currency,
    confidence,
    band: band(capped, input.baseline),
    reasoning,
  };
}

const CURRENCY_SYMBOL: Record<string, string> = {
  GBP: "£",
  USD: "$",
  EUR: "€",
};

export function formatPotential(v: number, currency: string): string {
  const sym = CURRENCY_SYMBOL[currency.toUpperCase()] ?? `${currency} `;
  if (v >= 1_000_000) return `${sym}${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 1_000) return `${sym}${Math.round(v / 1_000)}k`;
  return `${sym}${v}`;
}
