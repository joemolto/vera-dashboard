"use client";

import type { AccountVizData } from "./types";

/** Threat ↔ Posture balance — one horizontal bar split into "covered"
 * (green segments left) and "exposed" (red segments right). Width of
 * each segment proportional to its count. Imbalance = vendor opportunity. */
export function ThreatPostureBalance({ data }: { data: AccountVizData }) {
  const totalCells = 14;
  const cellW = 8;
  const cellH = 18;
  const gap = 2;
  const w = totalCells * cellW + (totalCells - 1) * gap;
  const h = cellH + 14;

  const covered = Math.min(data.coveredCount, totalCells);
  const exposed = Math.min(data.exposedCount, totalCells - covered);
  const blank = totalCells - covered - exposed;

  let cellIdx = 0;
  const cells: Array<{ tone: "covered" | "exposed" | "blank" }> = [];
  for (let i = 0; i < covered; i += 1) {
    cells.push({ tone: "covered" });
    cellIdx += 1;
  }
  for (let i = 0; i < exposed; i += 1) {
    cells.push({ tone: "exposed" });
    cellIdx += 1;
  }
  for (let i = 0; i < blank; i += 1) {
    cells.push({ tone: "blank" });
    cellIdx += 1;
  }

  return (
    <div
      className="inline-flex flex-col"
      title={`Covered: ${covered} categories. Active CVE exposure: ${exposed} categories. Bigger red = bigger sell-in opportunity.`}
    >
      <svg
        width={w}
        height={cellH}
        viewBox={`0 0 ${w} ${cellH}`}
        aria-label="Threat / posture balance"
      >
        {cells.map((c, i) => {
          const x = i * (cellW + gap);
          const fill =
            c.tone === "covered"
              ? "fill-emerald-400/80"
              : c.tone === "exposed"
                ? "fill-rose-500/80"
                : "fill-text-muted/12";
          return (
            <rect
              key={i}
              x={x}
              y={0}
              width={cellW}
              height={cellH}
              rx={1.5}
              className={fill}
            />
          );
        })}
      </svg>
      <div
        className="mt-1 flex justify-between font-mono text-[8.5px] uppercase tracking-[0.06em] text-text-muted"
        style={{ width: w }}
      >
        <span className="text-emerald-300/80">{covered} covered</span>
        {exposed > 0 && (
          <span className="text-rose-300/80">{exposed} exposed</span>
        )}
      </div>
    </div>
  );
}
