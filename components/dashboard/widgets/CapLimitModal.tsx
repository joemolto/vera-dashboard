"use client";

/**
 * CapLimitModal — the centered warning card a Vera Solo user sees when they
 * hit a plan cap (accounts, watched, unlocks, people). The engine returns a
 * 429 with {error: "solo_limit_reached", message}; the message is shown
 * verbatim and we offer the upgrade path.
 */

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export function CapLimitModal({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-border-default bg-bg-card p-6 text-center shadow-2xl"
      >
        <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-amber-500/15 text-amber-500">
          <AlertTriangle size={20} strokeWidth={1.8} />
        </div>
        <h2 className="mt-4 font-display text-[1.15rem] font-medium tracking-tight text-text-primary">
          You&apos;ve hit your plan limit
        </h2>
        <p className="mt-2.5 text-[13.5px] leading-relaxed text-text-secondary">
          {message}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Link
            href="/dashboard/settings"
            onClick={onClose}
            className="rounded-xl bg-gradient-brand px-5 py-2.5 text-[14px] font-medium text-bg-base transition-opacity hover:opacity-90"
          >
            Upgrade capacity →
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] text-text-muted transition-colors hover:text-text-primary"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
