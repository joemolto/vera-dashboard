"use client";

/**
 * ResearchAccountButton — a primary "Research an account" button that opens
 * a popup with the quick-enrich search (same engine as the Research page,
 * just a faster way in from the dashboard). Paste a company website or a
 * LinkedIn profile URL; QuickEnrichBar handles classification, enrichment
 * and navigation to the result.
 */

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { QuickEnrichBar } from "@/components/dashboard/widgets/QuickEnrichBar";

export function ResearchAccountButton() {
  const [open, setOpen] = useState(false);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Card form — sits as the first box in the dashboard KPI row,
          same dimensions as a metric card. */}
      <div className="flex flex-col justify-between gap-2.5 rounded-2xl border border-border-subtle bg-bg-card p-5 md:p-6">
        <div className="flex items-center justify-between gap-2 text-text-secondary">
          <span className="text-[12.5px] font-medium">Research</span>
          <Search size={13} strokeWidth={1.8} className="text-text-muted/70" />
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            backgroundImage:
              "linear-gradient(to bottom, var(--accent-hover), var(--accent))",
            boxShadow:
              "inset 0 1px 0 0 rgba(255,255,255,0.22), 0 6px 18px -5px var(--accent-glow)",
          }}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-medium text-white transition duration-150 hover:brightness-[1.08]"
        >
          <Search size={14} strokeWidth={2} />
          Research an account
        </button>
        <span className="text-[11.5px] text-text-muted">Paste a URL or LinkedIn</span>
      </div>

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[12vh] backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-border-default bg-bg-floating shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-border-subtle px-6 py-5">
              <div>
                <h2 className="font-display text-[1.05rem] font-medium tracking-tight text-text-primary">
                  Research an account
                </h2>
                <p className="mt-1 text-[13px] text-text-secondary">
                  Paste a company website or a LinkedIn profile — Vera researches
                  it in about 60 seconds.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="-mr-1 -mt-1 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
              >
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>
            <div className="px-6 py-6">
              <QuickEnrichBar />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
