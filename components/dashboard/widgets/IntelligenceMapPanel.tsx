"use client";

import { useMemo } from "react";
import { ArrowUpRight, TriangleAlert, X } from "lucide-react";
import {
  EDGE_TYPE_COLOURS,
  EDGE_TYPE_LABELS,
  RATING_COLOURS,
  RATING_LABELS,
  type IntelEdgeType,
  type IntelMapPayload,
  type IntelNode,
  type IntelSignal,
} from "@/lib/dashboard/intelligenceMap";

interface IntelligenceMapPanelProps {
  node: IntelNode;
  payload: IntelMapPayload;
  activeEdgeTypes: Set<IntelEdgeType>;
  onClose: () => void;
  onSelectCompany: (id: string) => void;
  onOpenProspects: (id: string) => void;
}

// Coarse "x ago" — good enough for a sales-context panel.
function relativeTime(iso: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) return "today";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// A signal's layer drives its colour; layer-less signals are context.
function signalColour(s: IntelSignal): string {
  return s.layer ? EDGE_TYPE_COLOURS[s.layer] : "#64748b";
}
function signalLayerLabel(s: IntelSignal): string {
  return s.layer ? EDGE_TYPE_LABELS[s.layer] : "Context";
}

function SignalCard({ signal }: { signal: IntelSignal }) {
  const colour = signalColour(signal);
  const when = relativeTime(signal.occurred_at);
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-elevated/60 p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-text-muted">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: colour }}
          aria-hidden
        />
        <span style={{ color: colour }}>{signalLayerLabel(signal)}</span>
        <span className="text-text-muted/60">·</span>
        <span className="truncate normal-case tracking-normal">
          {signal.source}
        </span>
        {when && (
          <>
            <span className="text-text-muted/60">·</span>
            <span className="normal-case tracking-normal">{when}</span>
          </>
        )}
      </div>

      <p className="mt-1.5 text-[13px] font-medium leading-snug text-text-primary">
        {signal.headline}
      </p>
      {signal.detail && signal.detail !== signal.headline && (
        <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">
          {signal.detail}
        </p>
      )}

      {signal.evidence.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {signal.evidence.map((e, i) => (
            <li
              key={i}
              className="flex gap-1.5 text-[11.5px] leading-snug text-text-muted"
            >
              <span aria-hidden>·</span>
              <span>{e}</span>
            </li>
          ))}
        </ul>
      )}

      {signal.recommended_use && (
        <p className="mt-2 rounded-md bg-bg-card px-2.5 py-1.5 text-[11.5px] leading-relaxed text-text-secondary">
          <span className="font-medium text-text-primary">Play · </span>
          {signal.recommended_use}
        </p>
      )}

      {signal.risk_note && (
        <p className="mt-2 flex gap-1.5 rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-200/90">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
          <span>{signal.risk_note}</span>
        </p>
      )}
    </div>
  );
}

export function IntelligenceMapPanel({
  node,
  payload,
  activeEdgeTypes,
  onClose,
  onSelectCompany,
  onOpenProspects,
}: IntelligenceMapPanelProps) {
  // Companies linked to this one, grouped by the active edge layers —
  // this is the "cross-reference" surface: see who shares the situation.
  const connections = useMemo(() => {
    const nodeById = new Map(payload.nodes.map((n) => [n.id, n]));
    const groups = new Map<IntelEdgeType, IntelNode[]>();
    const seen = new Set<string>();
    for (const e of payload.edges) {
      if (!activeEdgeTypes.has(e.edge_type)) continue;
      let otherId: string | null = null;
      if (e.source === node.id) otherId = e.target;
      else if (e.target === node.id) otherId = e.source;
      if (!otherId) continue;
      const key = `${e.edge_type}:${otherId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const other = nodeById.get(otherId);
      if (!other) continue;
      const list = groups.get(e.edge_type) ?? [];
      list.push(other);
      groups.set(e.edge_type, list);
    }
    return groups;
  }, [payload, node.id, activeEdgeTypes]);

  const connectionGroups = [...connections.entries()].filter(
    ([, list]) => list.length > 0,
  );

  return (
    <aside
      className="absolute right-3 top-3 bottom-3 z-10 flex w-[340px] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-xl border border-border-default bg-bg-card/95 shadow-2xl backdrop-blur-md"
      aria-label={`Intelligence for ${node.label}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-medium text-text-primary">
            {node.label}
          </h2>
          <p className="mt-0.5 truncate text-[11.5px] text-text-muted">
            {node.industry !== "unknown" ? node.industry : "Industry unknown"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em]"
            style={{
              color: RATING_COLOURS[node.lead_rating],
              backgroundColor: `${RATING_COLOURS[node.lead_rating]}22`,
            }}
          >
            {RATING_LABELS[node.lead_rating]}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-text-muted transition hover:bg-bg-elevated hover:text-text-primary"
            aria-label="Close panel"
          >
            <X size={15} aria-hidden />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {/* Signals */}
        <section>
          <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
            Live signals · {node.signals.length}
          </h3>
          {node.signals.length === 0 ? (
            <p className="text-[12px] leading-relaxed text-text-muted">
              No live signals for this company yet — it&apos;s on the map as a
              researched account, with nothing time-sensitive to act on right
              now.
            </p>
          ) : (
            <div className="space-y-2">
              {node.signals.map((s, i) => (
                <SignalCard key={`${s.type}-${i}`} signal={s} />
              ))}
            </div>
          )}
        </section>

        {/* Connections — the cross-reference */}
        <section>
          <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
            Connected companies
          </h3>
          {connectionGroups.length === 0 ? (
            <p className="text-[12px] leading-relaxed text-text-muted">
              No connections in the active layers. Toggle more layers on to see
              who shares this company&apos;s situation.
            </p>
          ) : (
            <div className="space-y-3">
              {connectionGroups.map(([type, list]) => (
                <div key={type}>
                  <div className="mb-1 flex items-center gap-2 text-[11px]">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: EDGE_TYPE_COLOURS[type] }}
                      aria-hidden
                    />
                    <span className="text-text-secondary">
                      {EDGE_TYPE_LABELS[type]}
                    </span>
                    <span className="font-mono text-[10px] text-text-muted">
                      {list.length}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {list.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onSelectCompany(c.id)}
                        className="flex w-full items-center justify-between gap-2 rounded-md border border-border-subtle bg-bg-elevated/40 px-2.5 py-1.5 text-left transition hover:border-border-default hover:bg-bg-elevated"
                      >
                        <span className="min-w-0 truncate text-[12.5px] text-text-primary">
                          {c.label}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-text-muted">
                          {c.signal_count} sig
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Footer */}
      <div className="border-t border-border-subtle px-4 py-3">
        <button
          type="button"
          onClick={() => onOpenProspects(node.id)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-bg-elevated px-3 py-2 text-[12.5px] font-medium text-text-primary transition hover:bg-border-subtle"
        >
          Open prospect list
          <ArrowUpRight size={14} aria-hidden />
        </button>
      </div>
    </aside>
  );
}
