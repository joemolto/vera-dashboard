"use client";

/**
 * SoloCapacityCards — the plan/capacity chooser on Settings. One card per
 * tier (Solo / Solo Plus 1-3) with accounts + price; switching is a
 * slide-to-confirm (money action) that modifies the existing subscription
 * (Stripe prorates — no checkout).
 */

import { useState } from "react";
import { Card, Pill, SectionHeader } from "@/components/dashboard/primitives";
import { useOrg } from "@/components/dashboard/OrgContext";
import { useSoloLimits, useSoloCapacity } from "@/lib/dashboard/queries";
import { SlideToConfirm } from "@/components/ui/SlideToConfirm";
import { cn } from "@/lib/utils";

// What Stripe charges per capacity level (hosted billing only). Display
// must always mirror STRIPE_PRICE_SOLO_MONTHLY / _PLUS{1,2,3} — the
// engine charges those, whatever this file says.
const PACK_PRICES = [149, 184, 229, 274];

export function SoloCapacityCards() {
  const { features } = useOrg();
  // Packs are an Individual lever — Starter inherits solo_plan for the cap
  // chrome but upgrades to Individual instead (StarterPlanCard), and the
  // engine rejects pack changes for it.
  const isSolo = !!features.solo_plan && !features.starter_plan;
  const { data } = useSoloLimits(isSolo);
  const setCapacity = useSoloCapacity();
  const [target, setTarget] = useState<number | null>(null);

  if (!isSolo || !data) return null;

  const current = data.capacity_packs;
  // Per-pack increments (default to 0 so a cached payload without the newer
  // fields just shows accounts scaling, never NaN).
  const packAcc = data.pack_accounts;
  const packWatch = data.pack_watched ?? 0;
  const packUnlock = data.pack_unlocks ?? 0;
  // "People watched" is the people lever now (monitored_people). Fall back to
  // the old person-intel-accounts cap until the engine returning the new cap
  // is deployed, so the cards never read 0.
  const packPeople = data.pack_monitored_people ?? data.pack_person_intel ?? 0;
  const basePeopleCap =
    data.limits.monitored_people ?? data.limits.person_intel_accounts;
  // True base = current cap minus what the current packs added.
  const baseAcc = data.limits.accounts - packAcc * current;
  const baseWatch = data.limits.watched - packWatch * current;
  const baseUnlock = data.limits.unlocks_per_month - packUnlock * current;
  const basePeople = basePeopleCap - packPeople * current;
  const tiers = Array.from({ length: data.max_capacity_packs + 1 }, (_, p) => ({
    packs: p,
    accounts: baseAcc + packAcc * p,
    watched: baseWatch + packWatch * p,
    unlocks: baseUnlock + packUnlock * p,
    monitored: basePeople + packPeople * p,
    price: PACK_PRICES[p] ?? PACK_PRICES[PACK_PRICES.length - 1],
    name: p === 0 ? "Individual" : `Individual Plus ${p}`,
  }));

  return (
    <Card className="p-6 md:p-7">
      <SectionHeader title="Plan & capacity" />
      <p className="mb-4 text-[12.5px] leading-snug text-text-muted">
        Each step up gives you more of everything — accounts to research each
        month, accounts to watch, contact unlocks per month, and people to
        monitor. Upgrades are charged to your card today (prorated for the rest
        of the month) — no checkout. You can change down any time; downgrades
        take effect with no refund for the current month.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {tiers.map((t) => {
          const isCurrent = t.packs === current;
          const isUpgrade = t.packs > current;
          return (
            <div
              key={t.packs}
              className={cn(
                "flex flex-col rounded-xl border p-4",
                isCurrent ? "border-accent/50 bg-accent/[0.05]" : "border-border-default",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-medium text-text-primary">{t.name}</span>
                {isCurrent && <Pill variant="muted">Current</Pill>}
              </div>
              <div className="mt-2 font-display text-[1.45rem] font-medium tracking-tight text-text-primary">
                ${t.price}
                <span className="text-[12px] text-text-muted">/mo</span>
              </div>
              <ul className="mt-2.5 flex flex-col gap-1 text-[12px] text-text-secondary">
                <li>{t.accounts} accounts researched / mo</li>
                <li>{t.watched} accounts monitored for signals</li>
                <li>{t.unlocks} contact unlocks / mo</li>
                <li>{t.monitored} people watched</li>
              </ul>

              <div className="mt-3.5">
                {isCurrent ? (
                  <span className="text-[12px] text-text-muted">Your current plan</span>
                ) : target === t.packs ? (
                  <div className="flex flex-col gap-2">
                    {!isUpgrade && data.usage.watched > t.watched && (
                      <p className="text-[11.5px] leading-snug text-amber-500">
                        Vera will stop watching your{" "}
                        {data.usage.watched - t.watched} most recently-added
                        watched account{data.usage.watched - t.watched === 1 ? "" : "s"}{" "}
                        — you keep the data, and can re-watch within the new
                        limit any time. Researched accounts are unaffected.
                      </p>
                    )}
                    <SlideToConfirm
                      text={`Confirm · $${t.price}/mo`}
                      successText="Updating…"
                      width={210}
                      height={34}
                      onConfirm={async () => {
                        await setCapacity.mutateAsync(t.packs);
                        setTarget(null);
                      }}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setTarget(t.packs)}
                    className={cn(
                      "rounded-lg px-4 py-2 text-[13px] font-medium transition-colors",
                      isUpgrade
                        ? "bg-gradient-brand text-bg-base hover:opacity-90"
                        : "border border-border-default text-text-secondary hover:border-border-strong hover:text-text-primary",
                    )}
                  >
                    {isUpgrade ? "Upgrade" : "Switch to this"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
