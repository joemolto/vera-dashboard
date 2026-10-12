"use client";

/**
 * AccountCapBlock — a small popup over the research page when a Vera Solo org
 * has used its monthly account allowance. Caps-based, never credits: research
 * is blocked until they upgrade or the allowance resets. Kept small and simple
 * (2026-06-28): a light scrim plus a compact card, not a full-page block.
 * The sidebar stays usable, so the user is never trapped.
 */

import Link from "next/link";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";

export function AccountCapBlock({
  used,
  limit,
  lapsed = false,
}: {
  used: number;
  limit: number;
  lapsed?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="absolute inset-0 z-20 grid place-items-center bg-bg-base/55 px-6 backdrop-blur-[2px]"
    >
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
        className="w-full max-w-xs rounded-2xl border border-border-default bg-bg-card p-6 text-center shadow-[0_24px_60px_-24px_rgba(0,0,0,0.6)]"
      >
        <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-amber-500/15 text-amber-500">
          <Lock size={17} strokeWidth={1.8} />
        </div>
        <h2 className="mt-4 font-display text-[1.05rem] font-medium tracking-tight text-text-primary">
          {lapsed ? "Your subscription has ended" : "You're out of accounts"}
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
          {lapsed ? (
            <>Research is paused while your subscription is inactive. Reactivate to start researching again — your accounts are still here.</>
          ) : (
            <>
              You&apos;ve researched all {limit} accounts in your plan this month
              ({used}/{limit}). Upgrade for more capacity to keep going.
            </>
          )}
        </p>
        <Link
          href="/dashboard/settings"
          className="mt-5 block w-full rounded-xl bg-gradient-brand px-5 py-2.5 text-[13.5px] font-medium text-bg-base transition-opacity hover:opacity-90"
        >
          {lapsed ? "Reactivate →" : "Upgrade for more accounts →"}
        </Link>
        {!lapsed && (
          <p className="mt-3 text-[12px] text-text-muted">
            Your allowance resets at the start of next month.
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}
