"use client";

import type { AccountVizData, VizEvent } from "./types";

interface Props {
  data: AccountVizData;
}

// Bucket size: ~3 days each for a 90-day window → 30 buckets.
const BUCKET_COUNT = 30;
const BUCKET_DAYS = 90 / BUCKET_COUNT;

const KIND_FILL: Record<VizEvent["kind"], string> = {
  intent: "#7dd3fc",   // sky-300
  threat: "#fda4af",   // rose-300
  posture: "#6ee7b7",  // emerald-300
  people: "#fcd34d",   // amber-300
  funding: "#c4b5fd",  // violet-300
};

// Verdict palette — the WAVE colour, derived from the dot pattern.
const VERDICT_TONE = {
  hot: { stroke: "#34d399", fill: "url(#wave-grad-hot)", label: "Active" },
  warm: { stroke: "#fbbf24", fill: "url(#wave-grad-warm)", label: "Warming" },
  risk: { stroke: "#fb7185", fill: "url(#wave-grad-risk)", label: "Threat-led" },
  cold: { stroke: "#52525b", fill: "url(#wave-grad-cold)", label: "Quiet" },
} as const;

type Verdict = keyof typeof VERDICT_TONE;

/** SignalWave — area chart of signal density over the last 90 days,
 * with individual event dots overlaid. The wave colour is derived from
 * WHERE the dots cluster (recent + many = green) and WHAT kind they
 * are (threat-dominated = red). Single glance answers "is this account
 * heating up, cooling down, or burning?". */
export function SignalWave({ data }: Props) {
  const all = [
    ...data.eventBuckets.last7d.map((e) => ({ ev: e, ageDays: 3.5 })),
    ...data.eventBuckets.last30d.map((e) => ({ ev: e, ageDays: 18 })),
    ...data.eventBuckets.last90d.map((e) => ({ ev: e, ageDays: 60 })),
  ];
  // Bucket events into 30 slots (oldest → newest going right)
  const buckets: { count: number; events: VizEvent[] }[] = Array.from(
    { length: BUCKET_COUNT },
    () => ({ count: 0, events: [] }),
  );
  for (const { ev, ageDays } of all) {
    // Right edge = today (age 0). Left edge = 90 days ago.
    const fromRight = Math.floor(ageDays / BUCKET_DAYS);
    const idx = Math.max(0, Math.min(BUCKET_COUNT - 1, BUCKET_COUNT - 1 - fromRight));
    buckets[idx].count += 1;
    buckets[idx].events.push(ev);
  }

  const verdict = deriveVerdict(buckets);
  const tone = VERDICT_TONE[verdict];

  // Render area + line
  const w = 160;
  const h = 44;
  const padX = 2;
  const padTop = 4;
  const padBottom = 2;
  const innerW = w - padX * 2;
  const innerH = h - padTop - padBottom;
  const xFor = (i: number) =>
    padX + (i / Math.max(1, BUCKET_COUNT - 1)) * innerW;
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  const yFor = (c: number) => padTop + innerH - (c / maxCount) * innerH;

  // Build smoothed path
  const pts = buckets.map((b, i) => [xFor(i), yFor(b.count)] as [number, number]);
  const linePath = smoothPath(pts);
  const areaPath = `${linePath} L${xFor(BUCKET_COUNT - 1)},${padTop + innerH} L${xFor(0)},${padTop + innerH} Z`;

  // Dots placed at each event, jittered within their bucket
  const dots = buckets.flatMap((b, i) => {
    if (b.events.length === 0) return [];
    const baseX = xFor(i);
    const baseY = yFor(b.count);
    return b.events.slice(0, 8).map((ev, eIdx) => {
      // small vertical offset per event so dots within a bucket stack visibly
      const offsetY = eIdx * 1.6;
      return {
        cx: baseX,
        cy: Math.max(padTop, baseY - offsetY),
        r: 2.2,
        fill: KIND_FILL[ev.kind],
        title: ev.label,
      };
    });
  });

  return (
    <div
      className="inline-flex flex-col"
      title={`${tone.label} · ${all.length} signals in last 90 days`}
    >
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        aria-label={`Signal wave — ${tone.label}`}
      >
        <defs>
          <linearGradient id="wave-grad-hot" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="wave-grad-warm" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="wave-grad-risk" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#fb7185" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#fb7185" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="wave-grad-cold" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#52525b" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#52525b" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Filled area */}
        <path d={areaPath} fill={tone.fill} />
        {/* Wave line */}
        <path
          d={linePath}
          fill="none"
          stroke={tone.stroke}
          strokeWidth={1.3}
          strokeLinecap="round"
        />
        {/* Individual event dots */}
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.cx}
            cy={d.cy}
            r={d.r}
            fill={d.fill}
            opacity={0.95}
          >
            <title>{d.title}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-0.5 flex items-center justify-between font-mono text-[8.5px] uppercase tracking-[0.1em] text-text-muted">
        <span>90d</span>
        <span style={{ color: tone.stroke }}>{tone.label}</span>
        <span>now</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verdict logic — derives the wave colour from the dot pattern.
// ---------------------------------------------------------------------------

function deriveVerdict(
  buckets: { count: number; events: VizEvent[] }[],
): Verdict {
  // recent = last third (last ~30 days)
  const recent = buckets.slice(-Math.floor(BUCKET_COUNT / 3));
  const older = buckets.slice(0, -Math.floor(BUCKET_COUNT / 3));
  const recentCount = recent.reduce((s, b) => s + b.count, 0);
  const olderCount = older.reduce((s, b) => s + b.count, 0);
  const total = recentCount + olderCount;

  if (total === 0) return "cold";

  // Threat-dominated check
  const allEvents = buckets.flatMap((b) => b.events);
  const threatRatio =
    allEvents.filter((e) => e.kind === "threat").length / allEvents.length;
  if (threatRatio > 0.6) return "risk";

  // Hot = recent activity dominates
  if (recentCount >= 3 && recentCount >= olderCount) return "hot";
  if (recentCount >= 1) return "warm";
  return "cold";
}

// ---------------------------------------------------------------------------
// Smoothed cubic-bezier path through points — for a nicer wave than
// straight-line connections. Catmull-Rom-ish.
// ---------------------------------------------------------------------------

function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const d: string[] = [`M${pts[0][0]},${pts[0][1]}`];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d.push(`C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`);
  }
  return d.join(" ");
}
