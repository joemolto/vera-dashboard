/**
 * Signal taxonomy — maps the engine's raw signal_type strings to a
 * display label, a semantic colour, and an icon. Single source of truth
 * so the hero, Act-on-today signal cards, and the two intel feeds all
 * label and colour-code signals identically.
 *
 * Colours reuse existing semantic tokens only — no new palette.
 */

import {
  AlertTriangle,
  Banknote,
  Bug,
  Building2,
  Network,
  Newspaper,
  Rocket,
  ShieldAlert,
  TrendingUp,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

export type SignalCategory = "market" | "threat";

export interface SignalMeta {
  /** Uppercase label shown on the coloured chip. */
  label: string;
  category: SignalCategory;
  Icon: LucideIcon;
  /** Tailwind text colour for the label + icon. Semantic tokens only. */
  color: string;
  /** Faint background for the icon chip. */
  bg: string;
}

// Market = GTM/buying signals. Threat = cyber-native intel.
// One entry per canonical signal type the engine emits.
const TAXONOMY: Record<string, SignalMeta> = {
  // ── Market / buying signals ─────────────────────────────────────────
  recent_funding: {
    label: "FUNDING",
    category: "market",
    Icon: Banknote,
    color: "text-accent",
    bg: "bg-accent/10",
  },
  recently_funded: {
    label: "FUNDING",
    category: "market",
    Icon: Banknote,
    color: "text-accent",
    bg: "bg-accent/10",
  },
  new_leadership: {
    label: "EXEC HIRE",
    category: "market",
    Icon: UserPlus,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  security_leadership_hire: {
    label: "CISO CHANGE",
    category: "market",
    Icon: UserPlus,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  product_launch: {
    label: "PRODUCT LAUNCH",
    category: "market",
    Icon: Rocket,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  product_launch_or_partnership: {
    label: "PRODUCT LAUNCH",
    category: "market",
    Icon: Rocket,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  new_partnership: {
    label: "PARTNERSHIP",
    category: "market",
    Icon: Network,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  hiring: {
    label: "HIRING SPIKE",
    category: "market",
    Icon: Users,
    color: "text-accent",
    bg: "bg-accent/10",
  },
  hiring_sales_bd: {
    label: "HIRING SPIKE",
    category: "market",
    Icon: Users,
    color: "text-accent",
    bg: "bg-accent/10",
  },
  hiring_security: {
    label: "SECURITY HIRING",
    category: "market",
    Icon: Users,
    color: "text-accent",
    bg: "bg-accent/10",
  },
  soc_expansion: {
    label: "SOC EXPANSION",
    category: "market",
    Icon: Users,
    color: "text-accent",
    bg: "bg-accent/10",
  },
  // Engine emits `security_team_expansion` from _create_cyber_signals —
  // the canonical type. (soc_expansion above is a legacy alias.)
  security_team_expansion: {
    label: "SECURITY HIRING",
    category: "market",
    Icon: Users,
    color: "text-accent",
    bg: "bg-accent/10",
  },
  recent_acquisition: {
    label: "M&A",
    category: "market",
    Icon: Building2,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  expansion: {
    label: "EXPANSION",
    category: "market",
    Icon: TrendingUp,
    color: "text-accent",
    bg: "bg-accent/10",
  },
  compliance_gap: {
    label: "COMPLIANCE",
    category: "market",
    Icon: AlertTriangle,
    color: "text-amber-300",
    bg: "bg-amber-400/10",
  },

  // ── Threat / cyber-native intel ─────────────────────────────────────
  cve_in_stack: {
    label: "CVE",
    category: "threat",
    Icon: Bug,
    color: "text-red-400",
    bg: "bg-red-500/10",
  },
  breach_proximity: {
    label: "BREACH",
    category: "threat",
    Icon: ShieldAlert,
    color: "text-red-400",
    bg: "bg-red-500/10",
  },
  breach: {
    label: "BREACH",
    category: "threat",
    Icon: ShieldAlert,
    color: "text-red-400",
    bg: "bg-red-500/10",
  },
  ransomware: {
    label: "ATTACK TREND",
    category: "threat",
    Icon: ShieldAlert,
    color: "text-red-400",
    bg: "bg-red-500/10",
  },
  attack_trend: {
    label: "ATTACK TREND",
    category: "threat",
    Icon: AlertTriangle,
    color: "text-amber-300",
    bg: "bg-amber-400/10",
  },
  dark_web: {
    label: "DARK WEB",
    category: "threat",
    Icon: ShieldAlert,
    color: "text-red-400",
    bg: "bg-red-500/10",
  },
};

const FALLBACK: SignalMeta = {
  label: "SIGNAL",
  category: "market",
  Icon: Newspaper,
  color: "text-text-secondary",
  bg: "bg-bg-elevated",
};

/** Normalise + look up a signal type. Unknown types get the neutral fallback. */
export function signalMeta(signalType: string | null | undefined): SignalMeta {
  if (!signalType) return FALLBACK;
  const key = String(signalType).toLowerCase().trim().replace(/[\s-]+/g, "_");
  return TAXONOMY[key] ?? FALLBACK;
}

/**
 * Pull a lead's strongest signal type out of its `signals` /
 * `buying_signals` arrays. Those arrays can hold either bare strings
 * ("recent_funding") or objects ({ type / signal_type / name }). We
 * defensively handle both and return the first usable type string.
 */
export function primarySignalType(lead: {
  signals?: unknown[] | null;
  buying_signals?: unknown[] | null;
}): string | null {
  const pools = [lead.signals, lead.buying_signals];
  for (const pool of pools) {
    if (!Array.isArray(pool)) continue;
    for (const item of pool) {
      if (typeof item === "string" && item.trim()) return item;
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        const t =
          obj.signal_type ?? obj.type ?? obj.name ?? obj.category ?? null;
        if (typeof t === "string" && t.trim()) return t;
      }
    }
  }
  return null;
}

/** Short relative-time string: "3H", "2D AGO", "JUST NOW". */
export function shortAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 1) return "JUST NOW";
  if (mins < 60) return `${mins}M`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}H`;
  const days = Math.floor(hrs / 24);
  return `${days}D AGO`;
}
