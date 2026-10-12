"use client";

/**
 * Starter upgrade surfaces. Starter is the fenced entry plan:
 * smart groups is the one feature fence (API/webhooks/MCP ship on every
 * paid plan since 2026-07-15), and Starter has no capacity packs. Two
 * pieces:
 *  - StarterUpgradeGate: full-page stand-in for a fenced surface
 *    (Groups): "Please upgrade to access" plus
 *    a link to upgrade.
 *  - StarterPlanCard: the Settings plan card (rendered where Individual
 *    sees SoloCapacityCards).
 * Both open the Stripe customer portal, same as BillingCard.
 */

import { useState } from "react";
import { ExternalLink, Loader2, Lock } from "lucide-react";
import { Card, PageHeader, PageShell, SectionHeader } from "@/components/dashboard/primitives";
import { useOrg } from "@/components/dashboard/OrgContext";
import { claraApi } from "@/lib/dashboard/claraApi";

function useBillingPortal() {
  const { orgId } = useOrg();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPortal = async () => {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const resp = (await claraApi("/billing/customer-portal", {
        method: "POST",
        body: JSON.stringify({
          org_id: orgId,
          return_url: `${window.location.origin}/dashboard/settings`,
        }),
      })) as { url: string };
      window.location.href = resp.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open billing. Try again.");
      setLoading(false);
    }
  };

  return { openPortal, loading, error };
}

function UpgradeButton({ label = "Upgrade" }: { label?: string }) {
  const { openPortal, loading, error } = useBillingPortal();
  return (
    <div>
      <button
        type="button"
        onClick={openPortal}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-60"
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} strokeWidth={1.7} />}
        {loading ? "Opening…" : label}
      </button>
      {error && <p className="mt-2 text-[12px] text-red-400">{error}</p>}
    </div>
  );
}

export function StarterUpgradeGate({
  eyebrow,
  title,
  blurb,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
}) {
  return (
    <PageShell>
      <PageHeader eyebrow={eyebrow} title={title} />
      <Card className="mt-6 p-6 md:p-7">
        <div className="grid min-h-[40vh] place-items-center text-center">
          <div className="flex max-w-sm flex-col items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-accent/15 text-accent">
              <Lock size={16} strokeWidth={1.7} />
            </span>
            <p className="text-[14px] font-medium text-text-primary">
              Please upgrade to access
            </p>
            <p className="text-[13px] leading-snug text-text-muted">{blurb}</p>
            <div className="mt-2">
              <UpgradeButton />
            </div>
          </div>
        </div>
      </Card>
    </PageShell>
  );
}

export function StarterPlanCard() {
  return (
    <Card className="p-6 md:p-7">
      <SectionHeader title="Plan" />
      <div className="mt-1 text-[14px] font-medium text-text-primary">
        Starter
      </div>
      <p className="mt-2 text-[12.5px] leading-snug text-text-muted">
        Individual raises every cap (150 researched accounts,
        25 watched, 500 contact unlocks, 25 people) and adds smart groups.
      </p>
      <div className="mt-4">
        <UpgradeButton label="Upgrade to Individual" />
      </div>
    </Card>
  );
}
