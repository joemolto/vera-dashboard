"use client";

/**
 * SoloCapBar — the cap chrome for Vera Solo orgs. Shows what's left of
 * the monthly allowances (accounts researched, contact unlocks) and the
 * standing ceilings (accounts watched, people watched), so the user
 * always knows where they stand without ever seeing a credit. Sits at
 * the top of the accounts page. Upgrades live on the Settings page
 * (SoloCapacityCards).
 */

import { useOrg } from "@/components/dashboard/OrgContext";
import { useSoloLimits } from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";

function CapPill({
  label,
  used,
  limit,
  monthly,
}: {
  label: string;
  used: number;
  limit: number;
  monthly?: boolean;
}) {
  const atCap = used >= limit;
  const near = !atCap && used >= limit * 0.8;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[11px] text-text-muted">{label}</span>
        <span
          className={cn(
            "font-mono text-[11.5px] tabular-nums",
            atCap ? "text-amber-500" : near ? "text-amber-400" : "text-text-secondary",
          )}
        >
          {used}/{limit}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-bg-elevated">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            atCap ? "bg-amber-500" : near ? "bg-amber-400" : "bg-accent",
          )}
          style={{ width: `${Math.min(100, (used / limit) * 100)}%` }}
        />
      </div>
      {monthly ? (
        <span className="text-[10px] text-text-muted">resets monthly</span>
      ) : null}
    </div>
  );
}

export function SoloCapBar() {
  const { features } = useOrg();
  const isSolo = !!features.solo_plan;
  const isStarter = !!features.starter_plan;
  const { data } = useSoloLimits(isSolo);
  if (!isSolo || !data) return null;

  return (
    <div className="mt-5 rounded-xl border border-border-default bg-bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[12.5px] font-medium text-text-primary">
          Your {isStarter ? "Starter" : "Individual"} plan
        </span>
        {/* Capacity packs are an Individual lever — Starter's upgrade
            path is the plan card, no pill needed. */}
        {!isStarter && (
          <a
            href="/dashboard/settings"
            className="rounded-md bg-accent/12 px-2.5 py-1 text-[11.5px] font-medium text-accent transition-colors hover:bg-accent/20"
          >
            Need more accounts? →
          </a>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <CapPill label="Researched" used={data.usage.accounts} limit={data.limits.accounts} monthly />
        <CapPill label="Watched" used={data.usage.watched} limit={data.limits.watched} />
        {data.limits.monitored_people != null ? (
          <CapPill
            label="People watched"
            used={data.usage.monitored_people ?? 0}
            limit={data.limits.monitored_people}
          />
        ) : (
          // Fallback until the engine returning monitored_people is deployed.
          <CapPill
            label="People tracked"
            used={data.usage.person_intel_accounts}
            limit={data.limits.person_intel_accounts}
          />
        )}
        <CapPill
          label="Contact unlocks"
          used={data.usage.unlocks_this_month}
          limit={data.limits.unlocks_per_month}
          monthly
        />
      </div>
    </div>
  );
}
