"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export interface AccountTab {
  id: string;
  label: string;
  /** Optional small count chip (e.g. "12" for People) */
  count?: number | null;
  /** Tooltip text */
  hint?: string;
}

/** Tabbed nav for the account page. Vera-native styling — minimal,
 * underline-accent on active. Not a copy of any competitor's tab style. */
export function AccountTabsBar({
  tabs,
  active,
  onChange,
}: {
  tabs: AccountTab[];
  active: string;
  onChange: (id: string) => void;
}) {
  const groupId = useId();
  return (
    <div
      role="tablist"
      aria-label="Account sections"
      className="flex items-end gap-0 overflow-x-auto border-b border-border-default"
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${groupId}-${t.id}`}
            aria-selected={isActive}
            aria-controls={`${groupId}-${t.id}-panel`}
            onClick={() => onChange(t.id)}
            title={t.hint}
            className={cn(
              "group relative inline-flex shrink-0 items-center gap-2 px-4 py-3 text-[13.5px] tracking-tight transition-colors",
              isActive
                ? "text-text-primary"
                : "text-text-muted hover:text-text-secondary",
            )}
          >
            {t.label}
            {typeof t.count === "number" && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 font-mono text-[10px] tracking-[0.04em] transition-colors",
                  isActive
                    ? "bg-bg-elevated text-text-primary"
                    : "bg-bg-elevated/50 text-text-muted",
                )}
              >
                {t.count}
              </span>
            )}
            {/* Underline accent — sliding effect via per-button render */}
            <span
              className={cn(
                "absolute inset-x-3 -bottom-px h-[2px] rounded-full transition-opacity",
                isActive
                  ? "bg-accent opacity-100"
                  : "bg-transparent opacity-0 group-hover:bg-text-muted/30 group-hover:opacity-60",
              )}
              aria-hidden
            />
          </button>
        );
      })}
    </div>
  );
}

export function AccountTabPanel({
  id,
  active,
  children,
}: {
  id: string;
  active: boolean;
  children: React.ReactNode;
}) {
  if (!active) return null;
  return (
    <div
      role="tabpanel"
      id={`${id}-panel`}
      aria-labelledby={id}
      className="pt-5"
    >
      {children}
    </div>
  );
}
