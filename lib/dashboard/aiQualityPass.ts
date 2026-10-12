/**
 * Client-side application of the AI quality pass output produced by
 * `app/services/ai_quality_pass.py`. Pure functions — no React, no
 * fetching. Take the deterministic signal/tech list + the AI pass, and
 * return cleaned-up shapes ready for render.
 *
 * Strict rule: AI pass NEVER replaces the deterministic baseline. If
 * the pass is missing/empty, every function returns the input unchanged
 * so the dashboard always falls back to the raw signals.
 */

// Structural type — these helpers only need an id. Avoids coupling
// to the account page-page-local SignalRow shape so this module can be
// reused on any page that queries signals.
export interface SignalLike {
  id: string;
}

// Re-declared locally to avoid coupling to the account page page's local type.
// Mirrors the engine schema in app/services/ai_quality_pass.py.
export interface AiQualityPass {
  dedup_groups?: {
    primary_signal_id: string;
    folded_signal_ids: string[];
    label: string;
  }[];
  entity_groups?: {
    canonical_name: string;
    merged_names: string[];
  }[];
  quality_scores?: Record<string, { score: number; note?: string }>;
  market_context_notes?: Record<string, string>;
  model?: string | null;
}

export interface TechEntryLike {
  name: string;
  category?: string;
  source?: string;
  detection_methods?: string[];
  behind_firewall?: boolean;
  // Added by applyEntityGroups when consolidating duplicates
  merged_variant_count?: number;
  merged_variant_names?: string[];
}

// ---------------------------------------------------------------------------
// Dedup — fold redundant signals into their primary
// ---------------------------------------------------------------------------

export type AnnotatedSignal<T extends SignalLike = SignalLike> = T & {
  /** Set when this signal absorbs others via the AI dedup_groups. */
  folded_count?: number;
  /** AI-provided label for the fold (e.g. "3 overlapping public-proof signals") */
  folded_label?: string;
  /** Market-context hedge from the AI pass, keyed by signal_id. */
  market_context_note?: string;
  /** AI quality score 0-1 if available. */
  quality_score?: number;
  quality_note?: string;
};

/**
 * Walk dedup_groups: keep primary signals, drop the folded ones, annotate
 * the primary with the fold count + AI label so the UI can show "+ N similar".
 */
export function applyDedupAndAnnotate<T extends SignalLike>(
  signals: T[],
  pass: AiQualityPass | null | undefined,
): AnnotatedSignal<T>[] {
  const dedup = pass?.dedup_groups ?? [];
  const contextNotes = pass?.market_context_notes ?? {};
  const qualityScores = pass?.quality_scores ?? {};

  // Build id → primary group + id → fold-into-this-primary maps
  const foldedToPrimary: Record<string, string> = {};
  const primaryFoldInfo: Record<string, { count: number; label: string }> = {};
  for (const g of dedup) {
    if (!g.primary_signal_id) continue;
    const folded = (g.folded_signal_ids ?? []).filter(
      (id) => id && id !== g.primary_signal_id,
    );
    if (folded.length === 0) continue;
    for (const fid of folded) foldedToPrimary[fid] = g.primary_signal_id;
    primaryFoldInfo[g.primary_signal_id] = {
      count: folded.length,
      label: g.label ?? `${folded.length} overlapping signal${folded.length === 1 ? "" : "s"}`,
    };
  }

  const out: AnnotatedSignal<T>[] = [];
  for (const s of signals) {
    if (foldedToPrimary[s.id]) continue; // drop — folded into a primary
    const annotated: AnnotatedSignal<T> = { ...s };
    const fold = primaryFoldInfo[s.id];
    if (fold) {
      annotated.folded_count = fold.count;
      annotated.folded_label = fold.label;
    }
    const note = contextNotes[s.id];
    if (typeof note === "string" && note.trim()) {
      annotated.market_context_note = note.trim();
    }
    const q = qualityScores[s.id];
    if (q && typeof q.score === "number") {
      annotated.quality_score = q.score;
      annotated.quality_note = q.note;
    }
    out.push(annotated);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Entity resolution — collapse tech list to canonical names
// ---------------------------------------------------------------------------

/**
 * Walk entity_groups: for each canonical name, find matching tech entries
 * by lowercased name match, keep the first as canonical, fold the others
 * into it (sum detection_methods, attach merged_variant_names).
 */
export function applyEntityGroups<T extends TechEntryLike>(
  technologies: T[],
  pass: AiQualityPass | null | undefined,
): T[] {
  const groups = pass?.entity_groups ?? [];
  if (groups.length === 0) return technologies;

  // Build alias → canonical name map (lowercased)
  const aliasToCanonical = new Map<string, string>();
  for (const g of groups) {
    if (!g.canonical_name) continue;
    const canonLc = g.canonical_name.toLowerCase();
    aliasToCanonical.set(canonLc, g.canonical_name);
    for (const alias of g.merged_names ?? []) {
      if (alias) aliasToCanonical.set(alias.toLowerCase(), g.canonical_name);
    }
  }
  if (aliasToCanonical.size === 0) return technologies;

  // Index input techs by lowercased name, in original order
  const byCanonical = new Map<string, T>();
  const remainder: T[] = [];

  for (const t of technologies) {
    if (!t.name) {
      remainder.push(t);
      continue;
    }
    const canon = aliasToCanonical.get(t.name.toLowerCase());
    if (!canon) {
      remainder.push(t);
      continue;
    }
    const existing = byCanonical.get(canon);
    if (!existing) {
      // Take this entry as the canonical representative, rename if needed
      const cloned: T = { ...t, name: canon };
      cloned.merged_variant_names = t.name !== canon ? [t.name] : [];
      cloned.merged_variant_count = 0;
      byCanonical.set(canon, cloned);
    } else {
      // Fold detection methods + record the variant
      const variants = existing.merged_variant_names ?? [];
      if (t.name !== existing.name && !variants.includes(t.name)) {
        variants.push(t.name);
      }
      existing.merged_variant_names = variants;
      existing.merged_variant_count = (existing.merged_variant_count ?? 0) + 1;
      // Merge detection methods (dedupe)
      const merged = new Set<string>([
        ...(existing.detection_methods ?? []),
        ...(t.detection_methods ?? []),
      ]);
      existing.detection_methods = Array.from(merged);
    }
  }

  // Concat in original order: canonical reps first (in insertion order), then remainder
  return [...byCanonical.values(), ...remainder];
}

// ---------------------------------------------------------------------------
// Tech market-context lookup — keyed by tech name (case-insensitive)
// ---------------------------------------------------------------------------

/**
 * Build a case-insensitive lookup of tech-name → market-context note.
 * Notes are returned exactly as the AI wrote them (hedged language).
 */
export function buildTechContextLookup(
  pass: AiQualityPass | null | undefined,
): Map<string, string> {
  const out = new Map<string, string>();
  const notes = pass?.market_context_notes ?? {};
  for (const [k, v] of Object.entries(notes)) {
    if (!k || typeof v !== "string" || !v.trim()) continue;
    // Skip signal-id keys (UUID format). Tech-name keys are alpha.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(k)) continue;
    out.set(k.toLowerCase(), v.trim());
  }
  return out;
}

// ---------------------------------------------------------------------------
// Quality-gate filter — drop signals AI scored below threshold
// ---------------------------------------------------------------------------

/**
 * Apply the quality gate. Signals scoring below `threshold` are dropped.
 * Default 0.3 — only truly thin signals get filtered, anything mid or
 * above stays. Returns input unchanged when the pass is missing.
 */
export function filterByQualityScore<T extends { id: string }>(
  signals: T[],
  pass: AiQualityPass | null | undefined,
  threshold = 0.3,
): T[] {
  const scores = pass?.quality_scores ?? {};
  if (Object.keys(scores).length === 0) return signals;
  return signals.filter((s) => {
    const q = scores[s.id];
    if (!q || typeof q.score !== "number") return true; // unrated → keep
    return q.score >= threshold;
  });
}
