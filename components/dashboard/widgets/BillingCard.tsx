"use client";

/**
 * BillingCard — manage the subscription via Stripe's hosted customer
 * portal (update card, view invoices, cancel). Closes the "no one can
 * change billing" gap. Shown to any paid org.
 */

import { useState } from "react";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { Card, SectionHeader } from "@/components/dashboard/primitives";
import { useOrg } from "@/components/dashboard/OrgContext";
import { useOrganisation } from "@/lib/dashboard/queries";
import { claraApi } from "@/lib/dashboard/claraApi";
import { CancellationModal } from "@/components/dashboard/widgets/CancellationModal";

// Display labels for the Starter / Individual / Team ladder (2026-07-15).
// Internal tier ids are unchanged (starter/solo/scout/growth/scale);
// solo→Individual, scout+growth+scale→Team.
const PLAN_LABEL: Record<string, string> = {
  starter: "Starter",
  solo: "Individual",
  scout: "Team",
  growth: "Team",
  scale: "Team",
  enterprise: "Team",
};

export function BillingCard() {
  const { orgId } = useOrg();
  const { data: org } = useOrganisation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Billing identity comes from subscription_tier — it diverges from `tier`
  // on custom deals (billed scout, monitored on the caps pipeline), and
  // those orgs must not see a self-serve list price here.
  const tier = (org?.subscription_tier ?? org?.tier ?? "").toLowerCase();
  const planLabel = PLAN_LABEL[tier] ?? (tier || "—");

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
      setError(
        e instanceof Error ? e.message : "Couldn't open billing — try again.",
      );
      setLoading(false);
    }
  };

  return (
    <Card className="p-6 md:p-7">
      <SectionHeader title="Billing" />
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-bg-elevated text-text-secondary">
          <CreditCard size={16} strokeWidth={1.7} />
        </div>
        <div className="min-w-0">
          <div className="font-display text-[15px] font-medium tracking-tight text-text-primary">
            {planLabel}
          </div>
          <div className="mt-0.5 text-[12px] text-text-muted">
            Your current plan
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={openPortal}
        disabled={loading}
        className="mt-5 flex w-full items-center justify-between gap-3 rounded-lg border border-border-subtle px-4 py-3 text-left text-[13px] text-text-secondary transition-colors hover:border-border-default hover:bg-bg-elevated/40 hover:text-text-primary disabled:opacity-60"
      >
        <span className="flex items-center gap-2.5">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} strokeWidth={1.7} />}
          {loading ? "Opening…" : "Manage billing"}
        </span>
      </button>
      {error && <p className="mt-2 text-[12px] text-red-400">{error}</p>}
      <p className="mt-3 text-[11.5px] leading-snug text-text-muted">
        Update your card or view invoices — handled securely by Stripe.
      </p>

      <button
        type="button"
        onClick={() => setCancelling(true)}
        className="mt-4 text-[12px] text-text-muted underline-offset-2 transition-colors hover:text-red-400 hover:underline"
      >
        Cancel subscription
      </button>

      {cancelling && <CancellationModal onClose={() => setCancelling(false)} />}
    </Card>
  );
}
