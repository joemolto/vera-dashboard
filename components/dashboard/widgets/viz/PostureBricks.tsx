"use client";

import type { AccountVizData } from "./types";

const CATS: Array<{
  key: keyof AccountVizData["postureCovered"];
  label: string;
}> = [
  { key: "iam", label: "IAM" },
  { key: "edr", label: "EDR" },
  { key: "email", label: "EML" },
  { key: "waf", label: "WAF" },
  { key: "siem", label: "SIEM" },
];

/** Posture bricks — 5 categories x 3 rows. Reads like a cyber report card.
 *  Row 1: covered?       (green if yes)
 *  Row 2: actively exposed? (red if CVE in stack)
 *  Row 3: recent signal in category? (amber if hiring/etc) */
export function PostureBricks({ data }: { data: AccountVizData }) {
  const cell = 14;
  const gap = 4;
  const cols = CATS.length;
  const rows = 3;
  const w = cols * cell + (cols - 1) * gap;
  const h = rows * cell + (rows - 1) * gap;

  function fillFor(row: number, key: (typeof CATS)[number]["key"]): string {
    if (row === 0) return data.postureCovered[key] ? "fill-emerald-400/80" : "fill-text-muted/15";
    if (row === 1) return data.postureExposed[key] ? "fill-rose-500/80" : "fill-text-muted/15";
    if (row === 2) return data.postureSignal[key] ? "fill-amber-400/80" : "fill-text-muted/15";
    return "fill-text-muted/15";
  }

  return (
    <div
      className="inline-flex flex-col"
      title="Posture x-ray — per category: covered / actively exposed / recent signal"
    >
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label="Posture bricks">
        {Array.from({ length: rows }).map((_, row) =>
          CATS.map((c, col) => {
            const x = col * (cell + gap);
            const y = row * (cell + gap);
            return (
              <rect
                key={`${row}-${c.key}`}
                x={x}
                y={y}
                width={cell}
                height={cell}
                rx={2}
                className={fillFor(row, c.key)}
              />
            );
          }),
        )}
      </svg>
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, ${cell}px)`,
          columnGap: gap,
          width: w,
        }}
      >
        {CATS.map((c) => (
          <div
            key={c.key}
            className="mt-1 truncate text-center font-mono text-[8px] uppercase tracking-[0.06em] text-text-muted"
          >
            {c.label}
          </div>
        ))}
      </div>
    </div>
  );
}
