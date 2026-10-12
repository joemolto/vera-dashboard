"use client";

/**
 * ViewToggle — segmented control for the top-left of the accounts page.
 * Data-driven so it can show two lenses (Accounts | People) or, for
 * decoupled-monitoring orgs, three (Research | Monitored | People).
 */

import { Building2, List, Radar, Users, type LucideIcon } from "lucide-react";

export type AccountsView = "accounts" | "people" | "monitored" | "all";

export interface ViewOption {
  key: AccountsView;
  label: string;
  Icon: LucideIcon;
  /** Optional count chip after the label. */
  count?: number;
}

export const VIEW_ICONS: Record<AccountsView, LucideIcon> = {
  accounts: Building2,
  people: Users,
  monitored: Radar,
  all: List,
};

export function ViewToggle({
  value,
  onChange,
  options,
}: {
  value: AccountsView;
  onChange: (v: AccountsView) => void;
  options: ViewOption[];
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-border-default bg-bg-card p-1">
      {options.map(({ key, label, Icon, count }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={active}
            className={[
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              active
                ? "bg-accent/12 text-accent"
                : "text-text-secondary hover:text-text-primary",
            ].join(" ")}
          >
            <Icon size={14} strokeWidth={1.8} />
            {label}
            {typeof count === "number" ? (
              <span
                className={[
                  "ml-0.5 rounded-full px-1.5 py-px font-mono text-[10.5px] tabular-nums",
                  active ? "bg-accent/15 text-accent" : "bg-bg-elevated text-text-muted",
                ].join(" ")}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
