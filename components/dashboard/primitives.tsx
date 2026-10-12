"use client";

import { motion } from "framer-motion";
import { GridPattern } from "@/components/ui/magicui/GridPattern";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/* ─────────────────────────── Page header ────────────────────────── */

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-text-muted">
          {eyebrow}
        </div>
        <h1 className="mt-3 font-display text-[clamp(1.5rem,3vw,2.1rem)] font-medium tracking-tight text-text-primary">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-text-secondary">
            {subtitle}
          </p>
        )}
      </div>
      {right && <div className="flex items-center gap-3">{right}</div>}
    </div>
  );
}

/* ─────────────────────────── Page wrapper ────────────────────────── */

export function PageShell({
  children,
  withGrid = true,
}: {
  children: ReactNode;
  withGrid?: boolean;
}) {
  return (
    <div className="relative overflow-hidden">
      {withGrid && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] overflow-hidden">
          <GridPattern
            width={48}
            height={48}
            x={-1}
            y={-1}
            squares={[
              [3, 1],
              [10, 2],
              [15, 4],
              [6, 5],
              [12, 7],
            ]}
            className="[mask-image:radial-gradient(560px_circle_at_30%_15%,white,transparent)] opacity-50"
          />
        </div>
      )}
      <div className="relative px-6 py-10 md:px-10 md:py-14">{children}</div>
    </div>
  );
}

/* ─────────────────────────── KPI card ────────────────────────── */

export function KpiCard({
  label,
  value,
  hint,
  icon,
  delta,
  loading,
  delay = 0,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  delta?: { value: string; positive?: boolean } | null;
  loading?: boolean;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.32, 0.72, 0, 1] }}
      className="relative overflow-hidden rounded-2xl border border-border-default bg-bg-card p-5"
    >
      <div className="flex items-start justify-between">
        <div className="text-[12.5px] font-medium text-text-secondary">
          {label}
        </div>
        {icon && <div className="text-text-muted">{icon}</div>}
      </div>
      <div className="mt-2 font-display text-[1.6rem] font-medium tracking-tight text-text-primary">
        {loading ? <Shimmer className="h-8 w-20" /> : value}
      </div>
      {(hint || delta) && (
        <div className="mt-2 flex items-baseline gap-2 text-[12.5px] text-text-muted">
          {delta && (
            <span
              className={cn(
                "font-mono text-[11px] tracking-tight",
                delta.positive ? "text-accent" : "text-text-secondary",
              )}
            >
              {delta.positive ? "↑" : "↓"} {delta.value}
            </span>
          )}
          {hint && <span>{hint}</span>}
        </div>
      )}
    </motion.div>
  );
}

/* ─────────────────────────── Pill ────────────────────────── */

type PillVariant =
  | "default"
  | "accent"
  | "warning"
  | "danger"
  | "muted"
  | "outline";

const PILL_VARIANTS: Record<PillVariant, string> = {
  default: "bg-bg-elevated text-text-secondary border-border-subtle",
  accent: "bg-accent/12 text-accent border-accent/30",
  warning: "bg-amber-400/10 text-amber-300 border-amber-400/30",
  danger: "bg-red-500/10 text-red-400 border-red-500/30",
  muted: "bg-bg-elevated/60 text-text-muted border-border-subtle",
  outline: "bg-transparent text-text-secondary border-border-default",
};

export function Pill({
  children,
  variant = "default",
  className,
}: {
  children: ReactNode;
  variant?: PillVariant;
  className?: string;
}) {
  // Typography 2026-05-28: dropped font-mono + uppercase + heavy tracking.
  // Pills are labels, not stamped boilerplate — readability first.
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]",
        PILL_VARIANTS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ─────────────────────────── Section header ────────────────────────── */

export function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 className="font-display text-[1.05rem] font-semibold tracking-tight text-text-primary">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 text-[12.5px] text-text-muted">{subtitle}</p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/* ─────────────────────────── Card ────────────────────────── */

export function Card({
  children,
  className,
  delay = 0,
  id,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** Anchor target (e.g. KPI cards link to #who-to-contact). */
  id?: string;
}) {
  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.32, 0.72, 0, 1] }}
      className={cn(
        "rounded-2xl border border-border-default bg-bg-card",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

/* ─────────────────────────── Empty / loading ────────────────────────── */

export function EmptyState({
  title,
  body,
  icon,
}: {
  title: string;
  body?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && (
        <div className="mb-4 grid h-10 w-10 place-items-center rounded-full bg-bg-elevated text-text-muted">
          {icon}
        </div>
      )}
      <div className="font-display text-[14px] font-medium tracking-tight text-text-primary">
        {title}
      </div>
      {body && (
        <div className="mt-2 max-w-sm text-[12.5px] leading-relaxed text-text-muted">
          {body}
        </div>
      )}
    </div>
  );
}

export function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-bg-elevated/60",
        className,
      )}
    >
      <div
        className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.04] to-transparent"
        style={{
          animation: "vera-shimmer 1.6s linear infinite",
        }}
      />
    </div>
  );
}

/* ─────────────────────────── Relative time ────────────────────────── */

export function RelativeTime({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-text-muted">—</span>;
  const ms = Date.now() - new Date(value).getTime();
  const minutes = Math.round(ms / 60_000);
  let label: string;
  if (minutes < 1) label = "just now";
  else if (minutes < 60) label = `${minutes}m ago`;
  else if (minutes < 60 * 24) label = `${Math.round(minutes / 60)}h ago`;
  else if (minutes < 60 * 24 * 30)
    label = `${Math.round(minutes / (60 * 24))}d ago`;
  else
    label = new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  return (
    <span title={new Date(value).toLocaleString()} className="text-text-muted">
      {label}
    </span>
  );
}
