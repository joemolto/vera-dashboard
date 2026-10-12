"use client";

/**
 * UpgradeGate — one shared modal that opens whenever an action hits a plan
 * cap (any tier, any door) or when a lapsed org tries to spend. It listens
 * on the global cap-hit signal (claraApi emits it on every 429), so we
 * never have to wire per-action upgrade prompts. Three variants, chosen
 * from the org's billing state:
 *   - lapsed (canceled/unpaid)  -> "Reactivate"       -> Stripe portal
 *   - starter_plan              -> "Upgrade to Individual" -> Stripe portal
 *   - individual                -> "Add capacity"      -> Settings
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Lock } from "lucide-react";
import { useOrg, isBillingLapsed } from "@/components/dashboard/OrgContext";
import { claraApi } from "@/lib/dashboard/claraApi";
import { onCapHit, type CapHit } from "@/lib/dashboard/upgradeSignal";

export function UpgradeGate() {
  const { orgId, features, subscriptionStatus } = useOrg();
  const [hit, setHit] = useState<CapHit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onCapHit((h) => setHit(h)), []);

  if (!hit) return null;

  const lapsed = isBillingLapsed(subscriptionStatus);
  const starter = !!features.starter_plan;

  const close = () => {
    setHit(null);
    setError(null);
  };

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
    } catch {
      setError("Couldn't open billing. Try again.");
      setLoading(false);
    }
  };

  let eyebrow: string;
  let title: string;
  let blurb: string;
  let cta: React.ReactNode;

  if (lapsed) {
    eyebrow = "Subscription ended";
    title = "Reactivate to pick up where you left off";
    blurb =
      "Monitoring, research and smart groups are paused. Your accounts, contacts and everything Vera found are still here — reactivate to bring them back to life.";
    cta = <PortalButton label="Reactivate" onClick={openPortal} loading={loading} />;
  } else if (starter) {
    eyebrow = "Starter limit reached";
    title = hit.message ?? "You've reached your Starter limit";
    blurb =
      hit.cap === "markets"
        ? "Individual runs up to 3 markets, each with its own targeting, weekly radar and deal size, plus higher caps across the board."
        : "Individual raises every cap — 150 accounts a month, 25 watched, 500 contact unlocks, 25 people — and adds smart groups.";
    cta = <PortalButton label="Upgrade to Individual" onClick={openPortal} loading={loading} />;
  } else if (hit.cap === "markets") {
    // Capacity packs don't add markets — the path past 3 is Team.
    eyebrow = "Plan limit reached";
    title = hit.message ?? "You're running all your markets";
    blurb =
      "Individual includes 3 markets. Team goes further, with markets, seats and capacity sized to your team.";
    cta = null;
  } else {
    eyebrow = "Plan limit reached";
    title = hit.message ?? "You've reached your plan limit";
    blurb =
      "Add capacity from Settings — each step raises your monthly and watched limits, prorated to your billing cycle.";
    cta = (
      <Link
        href="/dashboard/settings"
        onClick={close}
        className="inline-flex items-center gap-2 rounded-lg bg-gradient-brand px-4 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
      >
        Add capacity in Settings
      </Link>
    );
  }

  return (
    <div
      onClick={close}
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 px-4 py-8 backdrop-blur-sm sm:items-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-border-default bg-bg-card p-7 shadow-2xl"
      >
        <span className="grid h-10 w-10 place-items-center rounded-full bg-accent/15 text-accent">
          <Lock size={16} strokeWidth={1.7} />
        </span>
        <div className="mt-4 text-xs font-medium text-text-muted">{eyebrow}</div>
        <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-text-primary">
          {title}
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-text-secondary">{blurb}</p>
        {error && <p className="mt-3 text-[12.5px] text-red-500">{error}</p>}
        <div className="mt-5 flex items-center gap-3">
          {cta}
          <button
            type="button"
            onClick={close}
            className="text-[13px] text-text-muted transition-colors hover:text-text-primary"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

function PortalButton({
  label,
  onClick,
  loading,
}: {
  label: string;
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-lg bg-gradient-brand px-4 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {loading ? (
        <Loader2 size={13} className="animate-spin" />
      ) : (
        <ExternalLink size={13} strokeWidth={1.7} />
      )}
      {loading ? "Opening…" : label}
    </button>
  );
}
