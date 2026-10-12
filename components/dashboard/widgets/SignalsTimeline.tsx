"use client";

/**
 * SignalsTimeline — horizontal time-series of signals + alerts.
 *
 * Inspired by 6sense's activity graph but deliberately different:
 *   - Dots, not a filled area chart (Vera's data is discrete events,
 *     not a continuous engagement score).
 *   - Colour by signal subject_type, not by score.
 *   - Vera typography, no third-party chart library.
 *
 * Hover any dot to see the headline + when. Each dot is a real signal
 * with a real source URL where one exists.
 *
 * Spec rules honoured:
 *   - No "engagement score" (we don't have one and would be lying).
 *   - No 6sense-style "Reach / Engagement / Buying Stage" labels — those
 *     belong to their product, not ours.
 *   - Speculative signals are de-emphasised (small + muted opacity).
 */

import { useMemo, useState } from "react";
import { Card } from "@/components/dashboard/primitives";
import { scrubBackendNames } from "@/lib/dashboard/labels";
import { cn } from "@/lib/utils";

export interface TimelineSignal {
  id: string;
  signal_type: string;
  signal_subject_type?:
    | "account"
    | "person"
    | "job"
    | "website"
    | "tech"
    | "news";
  inference_level?: "observed" | "derived" | "inferred" | "speculative";
  signal_strength?: number | null;
  signal_data?: { headline?: string; detail?: string; source_url?: string };
  detected_at: string;
}

export interface TimelineAlert {
  id: string;
  alert_type?: string | null;
  alert_title?: string | null;
  alert_summary?: string | null;
  detected_at?: string | null;
}

interface Props {
  signals: TimelineSignal[];
  alerts?: TimelineAlert[];
  /** Visible window in days. Default 180 (6 months). */
  windowDays?: number;
}

// Colour per subject_type. Account = neutral blue, person = green, website
// = amber, tech = rose, job = purple, news = grey. Distinct enough that a
// rep can read the timeline at a glance without a legend.
const SUBJECT_TONE: Record<string, { dot: string; ring: string; label: string }> = {
  account: { dot: "fill-sky-300", ring: "stroke-sky-300/60", label: "Account" },
  person: { dot: "fill-emerald-300", ring: "stroke-emerald-300/60", label: "Person" },
  website: { dot: "fill-amber-300", ring: "stroke-amber-300/60", label: "Website" },
  tech: { dot: "fill-rose-300", ring: "stroke-rose-300/60", label: "Tech" },
  job: { dot: "fill-violet-300", ring: "stroke-violet-300/60", label: "Job" },
  news: { dot: "fill-text-muted", ring: "stroke-text-muted/60", label: "News" },
  alert: { dot: "fill-orange-300", ring: "stroke-orange-300/60", label: "Watchlist alert" },
};

/** Smooth Catmull-Rom spline through the points, emitted as cubic beziers.
 * Turns the flow line's hard zig-zag corners (the dots sit on different
 * subject rows) into flowing curves between signals. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  const f = (n: number) => n.toFixed(2);
  let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    // Catmull-Rom → bezier control points (tension 0.5 via the /6).
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${f(cp1x)} ${f(cp1y)}, ${f(cp2x)} ${f(cp2y)}, ${f(p2.x)} ${f(p2.y)}`;
  }
  return d;
}

interface Point {
  id: string;
  date: Date;
  subject: keyof typeof SUBJECT_TONE;
  headline: string;
  detail?: string;
  signalType: string;
  inference?: TimelineSignal["inference_level"];
  url?: string;
  isAlert: boolean;
}

export function SignalsTimeline({ signals, alerts = [], windowDays = 180 }: Props) {
  const now = useMemo(() => Date.now(), []);
  const windowMs = windowDays * 86_400_000;
  const start = now - windowMs;

  const points = useMemo<Point[]>(() => {
    const out: Point[] = [];
    for (const s of signals) {
      const d = new Date(s.detected_at);
      const t = d.getTime();
      if (Number.isNaN(t) || t < start || t > now) continue;
      out.push({
        id: s.id,
        date: d,
        subject: (s.signal_subject_type ?? "account") as keyof typeof SUBJECT_TONE,
        headline:
          s.signal_data?.headline ?? s.signal_type.replace(/_/g, " "),
        detail: s.signal_data?.detail,
        signalType: s.signal_type,
        inference: s.inference_level,
        url: s.signal_data?.source_url,
        isAlert: false,
      });
    }
    for (const a of alerts) {
      if (!a.detected_at) continue;
      const d = new Date(a.detected_at);
      const t = d.getTime();
      if (Number.isNaN(t) || t < start || t > now) continue;
      out.push({
        id: a.id,
        date: d,
        subject: "alert",
        headline: a.alert_title ?? a.alert_type ?? "Watchlist alert",
        detail: a.alert_summary ?? undefined,
        signalType: a.alert_type ?? "alert",
        isAlert: true,
      });
    }
    out.sort((a, b) => a.date.getTime() - b.date.getTime());
    return out;
  }, [signals, alerts, start, now]);

  const [activeId, setActiveId] = useState<string | null>(null);

  if (points.length === 0) {
    return (
      <Card className="p-7 md:p-8">
        <div className="text-[11px] text-text-muted">
          Signal timeline
        </div>
        <p className="mt-3 text-[12.5px] text-text-muted">
          Nothing on the public surface in the last {windowDays} days. New
          signals will land here as they fire.
        </p>
      </Card>
    );
  }

  // Layout — horizontal SVG canvas, 1000×140
  const W = 1000;
  const H = 140;
  const PAD_L = 12;
  const PAD_R = 12;
  const innerW = W - PAD_L - PAD_R;
  const axisY = H - 30;

  // X position of a date in [start..now]
  const xFor = (d: Date) => {
    const ratio = (d.getTime() - start) / windowMs;
    return PAD_L + Math.max(0, Math.min(1, ratio)) * innerW;
  };

  // Y position: bucket dots by subject_type so similar signals stack
  // along their own row instead of all colliding on the axis.
  const rowOrder: (keyof typeof SUBJECT_TONE)[] = [
    "account",
    "alert",
    "person",
    "job",
    "website",
    "tech",
    "news",
  ];
  const yFor = (subject: keyof typeof SUBJECT_TONE) => {
    const idx = rowOrder.indexOf(subject);
    const present = idx >= 0 ? idx : 0;
    // Spread rows across vertical space above axis
    const step = (axisY - 24) / (rowOrder.length + 1);
    return 18 + present * step;
  };

  // Month ticks for the X axis
  const ticks = useMemo(() => {
    const out: { x: number; label: string }[] = [];
    const d = new Date(start);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    while (d.getTime() <= now) {
      out.push({
        x: xFor(d),
        label: d.toLocaleDateString(undefined, { month: "short" }),
      });
      d.setMonth(d.getMonth() + 1);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, now]);

  const subjectsPresent = useMemo(() => {
    const set = new Set<string>();
    for (const p of points) set.add(p.subject);
    return Array.from(set);
  }, [points]);

  const activePoint = points.find((p) => p.id === activeId) ?? null;

  return (
    <Card className="p-7 md:p-8">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] text-text-muted">
          Signal timeline
        </div>
        <div className="text-[11px] text-text-muted">
          Last {windowDays === 180 ? "6 months" : `${windowDays} days`} · {points.length} signals
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          className="block min-w-[600px]"
          role="img"
          aria-label={`Signal timeline showing ${points.length} signals over the last ${windowDays} days`}
        >
          {/* Axis line */}
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={axisY}
            y2={axisY}
            className="stroke-border-default"
            strokeWidth="1"
          />
          {/* Month ticks */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={t.x}
                x2={t.x}
                y1={axisY - 3}
                y2={axisY + 3}
                className="stroke-border-default"
                strokeWidth="1"
              />
              <text
                x={t.x}
                y={axisY + 16}
                className="fill-text-muted"
                fontSize="9"
                textAnchor="middle"
                fontFamily="ui-monospace, monospace"
              >
                {t.label}
              </text>
            </g>
          ))}

          {/* Today marker */}
          <line
            x1={xFor(new Date(now))}
            x2={xFor(new Date(now))}
            y1={10}
            y2={axisY}
            className="stroke-accent/40"
            strokeDasharray="2 3"
            strokeWidth="1"
          />

          {/* Flow line — connects every signal in chronological order with a
              dotted accent stroke, so the timeline reads as a path of activity
              through time rather than scattered dots. Rendered before the dots
              so they sit on top of the line. */}
          {points.length > 1 && (
            <path
              d={smoothPath(
                points.map((p) => ({ x: xFor(p.date), y: yFor(p.subject) })),
              )}
              className="fill-none stroke-accent/55"
              strokeWidth="1.5"
              strokeDasharray="1.5 5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Dots */}
          {points.map((p) => {
            const tone = SUBJECT_TONE[p.subject] ?? SUBJECT_TONE.account;
            const muted = p.inference === "speculative";
            const isActive = p.id === activeId;
            const r = muted ? 3 : 4.5;
            return (
              <g key={p.id}>
                {isActive && (
                  <circle
                    cx={xFor(p.date)}
                    cy={yFor(p.subject)}
                    r={r + 4}
                    className={cn("fill-none stroke-2", tone.ring)}
                  />
                )}
                <circle
                  cx={xFor(p.date)}
                  cy={yFor(p.subject)}
                  r={r}
                  className={cn(tone.dot, muted && "opacity-50")}
                  onMouseEnter={() => setActiveId(p.id)}
                  onMouseLeave={() => setActiveId((id) => (id === p.id ? null : id))}
                  onClick={() => setActiveId((id) => (id === p.id ? null : p.id))}
                  style={{ cursor: "pointer" }}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {subjectsPresent.map((s) => {
          const tone = SUBJECT_TONE[s] ?? SUBJECT_TONE.account;
          return (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 text-[11px] text-text-muted"
            >
              <svg width="8" height="8" className="inline-block">
                <circle cx="4" cy="4" r="3.5" className={tone.dot} />
              </svg>
              {tone.label}
            </span>
          );
        })}
      </div>

      {/* Hovered/clicked detail card */}
      {activePoint && (
        <div className="mt-4 rounded-lg border border-border-subtle bg-bg-elevated/60 p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13px] font-medium leading-snug text-text-primary">
                {scrubBackendNames(activePoint.headline)}
              </div>
              {activePoint.detail && (
                <div className="mt-1 text-[12px] leading-snug text-text-secondary">
                  {scrubBackendNames(activePoint.detail)}
                </div>
              )}
              <div className="mt-2 flex items-center gap-3 text-[11px] text-text-muted">
                <span>
                  {activePoint.date.toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <span className="text-text-muted/60">·</span>
                <span>{activePoint.signalType.replace(/_/g, " ")}</span>
                {activePoint.url && (
                  <>
                    <span className="text-text-muted/60">·</span>
                    <a
                      href={activePoint.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-text-primary"
                    >
                      View source
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
