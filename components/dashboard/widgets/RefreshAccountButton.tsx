"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/** Dossier header "Refresh" — fires a one-off monitor pass for this account
 *  (free, engine-debounced to one per hour). Watched accounts otherwise
 *  update on the weekly cadence, which left pre-call reps reading week-old
 *  intel with no way to fix it (2026-07-16 simulation, Rosa). */
export function RefreshAccountButton({ domain }: { domain: string }) {
  const [state, setState] = useState<"idle" | "pending" | "queued" | "error">(
    "idle",
  );

  async function fire() {
    if (state === "pending" || state === "queued") return;
    setState("pending");
    try {
      const res = await fetch("/api/accounts/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      setState(res.ok ? "queued" : "error");
    } catch {
      setState("error");
    }
  }

  const label =
    state === "pending"
      ? "Refreshing…"
      : state === "queued"
        ? "Refresh queued"
        : state === "error"
          ? "Try again"
          : "Refresh";

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={fire}
        disabled={state === "pending" || state === "queued"}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border-default px-3.5 py-1.5 text-[12.5px] font-medium text-text-secondary transition-colors",
          state === "queued"
            ? "cursor-default opacity-60"
            : "hover:border-accent/50 hover:text-text-primary",
        )}
      >
        <RefreshCw
          size={12}
          strokeWidth={2}
          className={state === "pending" ? "animate-spin" : undefined}
          aria-hidden
        />
        {label}
      </button>
      {state === "queued" && (
        <span className="text-[11px] text-text-muted">
          Fresh intel lands in a few minutes.
        </span>
      )}
    </div>
  );
}
