"use client";

import type { AccountVizData } from "./types";

const CATEGORIES: Array<{
  key: keyof AccountVizData["signalsByCategory"];
  label: string;
}> = [
  { key: "intent", label: "Intent" },
  { key: "threat", label: "Threat" },
  { key: "posture", label: "Posture" },
  { key: "people", label: "People" },
  { key: "funding", label: "Funding" },
];

const TONE: Record<keyof AccountVizData["signalsByCategory"], string> = {
  intent: "fill-sky-300/80",
  threat: "fill-rose-300/80",
  posture: "fill-emerald-300/80",
  people: "fill-amber-300/80",
  funding: "fill-violet-300/80",
};

/** Signal DNA — 5 vertical bars, one per signal category. Bar height =
 * normalised intensity (0..1). The SHAPE across bars tells the story. */
export function SignalDNA({ data }: { data: AccountVizData }) {
  const barW = 12;
  const gap = 6;
  const maxH = 56;
  const w = CATEGORIES.length * barW + (CATEGORIES.length - 1) * gap;
  const h = maxH + 18; // + label space

  return (
    <div
      className="inline-flex flex-col"
      title="Vera signal DNA — relative intensity of each signal category for this account"
    >
      <svg
        width={w}
        height={maxH}
        viewBox={`0 0 ${w} ${maxH}`}
        aria-label="Signal DNA bars"
      >
        {/* Baseline grid */}
        <line
          x1={0}
          x2={w}
          y1={maxH - 0.5}
          y2={maxH - 0.5}
          className="stroke-border-subtle"
          strokeWidth={1}
        />
        {CATEGORIES.map((c, i) => {
          const v = Math.max(0, Math.min(1, data.signalsByCategory[c.key]));
          const barH = Math.max(2, v * (maxH - 4));
          const x = i * (barW + gap);
          const y = maxH - barH;
          return (
            <g key={c.key}>
              {/* track */}
              <rect
                x={x}
                y={0}
                width={barW}
                height={maxH}
                rx={2}
                className="fill-text-muted/8"
              />
              {/* bar */}
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={2}
                className={TONE[c.key]}
              />
            </g>
          );
        })}
      </svg>
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${CATEGORIES.length}, ${barW}px)`,
          columnGap: gap,
          width: w,
        }}
      >
        {CATEGORIES.map((c) => (
          <div
            key={c.key}
            className="mt-1 truncate text-center font-mono text-[8.5px] uppercase tracking-[0.08em] text-text-muted"
          >
            {c.label[0]}
          </div>
        ))}
      </div>
      <span className="sr-only">
        Signal intensities — {CATEGORIES.map((c) => `${c.label}: ${Math.round(data.signalsByCategory[c.key] * 10)}/10`).join(", ")}.
      </span>
    </div>
  );
}
