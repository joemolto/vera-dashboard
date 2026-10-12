"use client";

import type { AccountVizData, VizEvent } from "./types";

const KIND_FILL: Record<VizEvent["kind"], string> = {
  intent: "fill-sky-300",
  threat: "fill-rose-300",
  posture: "fill-emerald-300",
  people: "fill-amber-300",
  funding: "fill-violet-300",
};

/** Convergence rings — three concentric semicircles representing time
 * windows (90d outer, 30d middle, 7d inner). Each ring holds dots for
 * the signal events landing in that window. Density in the inner ring
 * = something happening NOW. Vera's POV: convergence > volume. */
export function ConvergenceRings({ data }: { data: AccountVizData }) {
  const size = 84;
  const cx = size / 2;
  const cy = size / 2;
  const ringRadii = [38, 26, 14]; // outer→inner: 90d, 30d, 7d
  const buckets = [
    data.eventBuckets.last90d,
    data.eventBuckets.last30d,
    data.eventBuckets.last7d,
  ];

  return (
    <div
      className="inline-flex flex-col items-start"
      title="Convergence rings — outer = last 90d, middle = 30d, inner = 7d. Dots = signal events. Clustering in the inner ring means action NOW."
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-label="Convergence rings"
      >
        {/* Ring tracks */}
        {ringRadii.map((r, i) => (
          <circle
            key={`ring-${i}`}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            className="stroke-border-subtle"
            strokeDasharray="2 3"
            strokeWidth={1}
          />
        ))}
        {/* Centre dot */}
        <circle cx={cx} cy={cy} r={1.5} className="fill-text-muted/40" />
        {/* Events per ring, distributed around the circle */}
        {buckets.map((events, ringIdx) => {
          const r = ringRadii[ringIdx];
          return events.slice(0, 12).map((ev, i) => {
            // Stable angle from event index so it doesn't re-shuffle on re-render
            const angle = (i / Math.max(1, events.length)) * Math.PI * 2 - Math.PI / 2;
            const x = cx + r * Math.cos(angle);
            const y = cy + r * Math.sin(angle);
            const dotR = ringIdx === 2 ? 3.2 : ringIdx === 1 ? 2.8 : 2.2;
            return (
              <circle
                key={`ev-${ringIdx}-${i}`}
                cx={x}
                cy={y}
                r={dotR}
                className={KIND_FILL[ev.kind]}
              >
                <title>{ev.label}</title>
              </circle>
            );
          });
        })}
      </svg>
      <div className="mt-1 flex w-[84px] justify-between font-mono text-[8px] uppercase tracking-[0.06em] text-text-muted">
        <span>90d</span>
        <span>30d</span>
        <span>7d</span>
      </div>
    </div>
  );
}
