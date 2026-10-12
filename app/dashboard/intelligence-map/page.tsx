"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { notFound, useRouter } from "next/navigation";
import { Network, Eye, EyeOff, Loader2 } from "lucide-react";
import { useOrg } from "@/components/dashboard/OrgContext";
import { claraApi } from "@/lib/dashboard/claraApi";
import { IntelligenceMapGraph } from "@/components/dashboard/widgets/IntelligenceMapGraph";
import { IntelligenceMapPanel } from "@/components/dashboard/widgets/IntelligenceMapPanel";
import {
  ALL_EDGE_TYPES,
  DEFAULT_ACTIVE_EDGE_TYPES,
  EDGE_TYPE_COLOURS,
  EDGE_TYPE_LABELS,
  type IntelEdgeType,
  type IntelMapPayload,
} from "@/lib/dashboard/intelligenceMap";
import { cn } from "@/lib/utils";

export default function IntelligenceMapPage() {
  const { orgId, features } = useOrg();
  const router = useRouter();

  // Gate at the page level too — defence-in-depth in case the nav-side
  // feature flag is bypassed by typing the URL.
  if (!features.intelligence_map) {
    notFound();
  }

  const { data, isLoading, isError, error } = useQuery<IntelMapPayload>({
    queryKey: ["intelligence_map", orgId],
    queryFn: () => claraApi(`/dashboard/intelligence-map/${orgId}`, {}, 30_000),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const [activeTypes, setActiveTypes] = useState<Set<IntelEdgeType>>(
    new Set(DEFAULT_ACTIVE_EDGE_TYPES),
  );

  // The company whose cross-reference panel is open (null = none).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedNode = useMemo(
    () => data?.nodes.find((n) => n.id === selectedId) ?? null,
    [data, selectedId],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const edgeTypeCounts = useMemo(() => data?.meta.edge_types ?? {}, [data]);

  function toggle(type: IntelEdgeType) {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col gap-4 px-6 py-6 md:px-8 md:py-8">
      <header className="flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">
            <Network size={12} strokeWidth={1.7} />
            Beta · intelligence map
          </div>
          <h1 className="mt-2 font-display text-[1.6rem] font-medium tracking-tight text-text-primary md:text-[1.8rem]">
            Connected companies
          </h1>
          <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-text-secondary">
            Every company you&apos;ve researched, mapped by the live situations
            that move deals — new security leaders, funding, threat exposure.
            Drag to rotate the field, scroll to zoom, and click a company to
            see its signals and who shares them.
          </p>
        </div>

        {data && (
          <div className="hidden flex-col items-end gap-1 text-right text-[11.5px] text-text-muted md:flex">
            <span>
              <span className="font-mono text-text-primary">
                {data.meta.node_count}
              </span>{" "}
              companies
            </span>
            <span>
              <span className="font-mono text-text-primary">
                {data.meta.edge_count}
              </span>{" "}
              connections
            </span>
          </div>
        )}
      </header>

      {/* Layer toggles */}
      <div className="flex flex-wrap items-center gap-2">
        {ALL_EDGE_TYPES.map((type) => {
          const active = activeTypes.has(type);
          const count = edgeTypeCounts[type] ?? 0;
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggle(type)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] transition",
                active
                  ? "border-border-default bg-bg-elevated text-text-primary"
                  : "border-border-subtle bg-transparent text-text-muted hover:text-text-secondary",
              )}
              aria-pressed={active}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: EDGE_TYPE_COLOURS[type] }}
                aria-hidden
              />
              <span>{EDGE_TYPE_LABELS[type]}</span>
              <span className="font-mono text-[10.5px] text-text-muted">
                {count}
              </span>
              {active ? (
                <Eye size={12} aria-hidden />
              ) : (
                <EyeOff size={12} aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden rounded-2xl border border-border-default bg-bg-card"
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-[13px] text-text-muted">
            <Loader2 size={14} className="animate-spin" aria-hidden />
            Loading the graph…
          </div>
        )}
        {isError && (
          <div
            className="absolute inset-0 flex items-center justify-center px-6 text-center text-[13px] text-rose-300/80"
            role="alert"
          >
            Couldn&apos;t load the intelligence map.{" "}
            {error instanceof Error ? error.message : ""}
          </div>
        )}
        {!isLoading && !isError && data && data.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-[13px] text-text-muted">
            No enriched companies yet — once leads are enriched, they&apos;ll
            light up here.
          </div>
        )}
        {!isLoading && data && data.nodes.length > 0 && (
          <>
            <IntelligenceMapGraph
              payload={data}
              activeEdgeTypes={activeTypes}
              onNodeSelect={(n) => setSelectedId(n.id)}
              selectedId={selectedId}
              width={dims.w}
              height={dims.h}
            />
            {selectedNode && (
              <IntelligenceMapPanel
                node={selectedNode}
                payload={data}
                activeEdgeTypes={activeTypes}
                onClose={() => setSelectedId(null)}
                onSelectCompany={(id) => setSelectedId(id)}
                onOpenProspects={(id) =>
                  router.push(
                    `/dashboard/prospects?company=${encodeURIComponent(id)}`,
                  )
                }
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
