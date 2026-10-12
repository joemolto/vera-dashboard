// Intelligence Map — shared payload types.
//
// v2 "situation graph": nodes are companies carrying their live signals,
// edges link companies that share a situation (a new security leader,
// a growth event, a threat surface) or a tech-stack lookalike.
// Mirror of the engine builder in app/services/intelligence_map.py.

export type IntelEdgeType = "leadership" | "growth" | "threat" | "tech";

// The three situation layers a signal can belong to (tech is edge-only,
// derived from stack overlap — it is never a node signal layer).
export type IntelLayer = "leadership" | "growth" | "threat";

// One live signal attached to a company node.
export interface IntelSignal {
  layer: IntelLayer | null; // null = shown on the node but forms no edge
  type: string; // raw signal type, e.g. "security_leadership_hire"
  headline: string;
  detail: string;
  evidence: string[];
  recommended_use: string; // the rep's play (per-layer guidance)
  risk_note: string; // guardrail — populated for threat signals
  strength: number; // 0..1
  freshness: string;
  occurred_at: string; // ISO timestamp, or ""
  source: string; // clean, client-facing label (never a backend tool)
}

export interface IntelNode {
  id: string; // company domain
  label: string;
  industry: string;
  lead_rating: "hot" | "warm" | "cold" | "unrated";
  lead_count: number;
  signal_count: number;
  categories: IntelLayer[]; // which situation layers this company is in
  has_threat: boolean;
  signals: IntelSignal[];
}

export interface IntelEdge {
  source: string;
  target: string;
  edge_type: IntelEdgeType;
  weight: number;
  why: string;
}

export interface IntelMapPayload {
  nodes: IntelNode[];
  edges: IntelEdge[];
  meta: {
    node_count: number;
    edge_count: number;
    edge_types: Partial<Record<IntelEdgeType, number>>;
    max_nodes: number;
  };
}

export const ALL_EDGE_TYPES: IntelEdgeType[] = [
  "leadership",
  "growth",
  "threat",
  "tech",
];

// Leadership + growth lead on first open. Threat is available but off
// by default — it is peer context, never the pitch. Tech is a quiet
// lookalike layer, also off.
export const DEFAULT_ACTIVE_EDGE_TYPES: IntelEdgeType[] = [
  "leadership",
  "growth",
];

export const EDGE_TYPE_LABELS: Record<IntelEdgeType, string> = {
  leadership: "Leadership",
  growth: "Growth & investment",
  threat: "Threat surface",
  tech: "Shared tech",
};

// One-line description of what each layer means — shown in the panel.
export const EDGE_TYPE_BLURB: Record<IntelEdgeType, string> = {
  leadership: "New security leadership — a vendor-review window.",
  growth: "Funding, M&A, hiring — budget is moving.",
  threat: "Shared exposure — use as peer context only.",
  tech: "Overlapping tech stack — a structural lookalike.",
};

// Hex colours — drive both the filter pills and the 3D links/nodes.
export const EDGE_TYPE_COLOURS: Record<IntelEdgeType, string> = {
  leadership: "#a78bfa", // violet
  growth: "#34d399", // green
  threat: "#f59e0b", // amber
  tech: "#60a5fa", // blue
};

export const RATING_COLOURS: Record<IntelNode["lead_rating"], string> = {
  hot: "#fca5a5",
  warm: "#fbbf24",
  cold: "#9ca3af",
  unrated: "#6b7280",
};

export const RATING_LABELS: Record<IntelNode["lead_rating"], string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
  unrated: "Unrated",
};

// ---------------------------------------------------------------------------
// Industry clustering — normalise the engine's raw industry strings into
// ~6 macro buckets so the 3D graph can spatially group accounts. Each
// bucket has a fixed angle on a horizontal circle and the graph applies a
// custom force pulling each node toward its bucket centroid. Stops the
// graph reading as one dense ball when an org watches mixed verticals.
// ---------------------------------------------------------------------------

export type IndustryCluster =
  | "financial_services"
  | "insurance"
  | "healthcare"
  | "utilities"
  | "cybersecurity"
  | "other";

export const INDUSTRY_CLUSTER_ORDER: IndustryCluster[] = [
  "financial_services",
  "insurance",
  "healthcare",
  "utilities",
  "cybersecurity",
  "other",
];

export const INDUSTRY_CLUSTER_LABELS: Record<IndustryCluster, string> = {
  financial_services: "Financial Services",
  insurance: "Insurance",
  healthcare: "Healthcare",
  utilities: "Utilities & Energy",
  cybersecurity: "Cybersecurity",
  other: "Other",
};

export function classifyIndustry(raw: string | null | undefined): IndustryCluster {
  const s = (raw ?? "").toLowerCase();
  if (!s) return "other";
  if (/bank|fintech|financial|credit union|building society|capital markets|investment|wealth|asset management|brokerage/.test(s))
    return "financial_services";
  if (/insurance|reinsurance|underwrit/.test(s)) return "insurance";
  if (/pharma|hospital|health|medical|biotech|life sciences|clinic/.test(s))
    return "healthcare";
  if (/utilit|energy|electric|gas|oil|water|power|renewable/.test(s))
    return "utilities";
  if (/cyber|security|infosec|mssp|mdr|edr|siem|soc|threat/.test(s))
    return "cybersecurity";
  return "other";
}
