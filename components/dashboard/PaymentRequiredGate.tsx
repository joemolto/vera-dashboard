"use client";

/**
 * PaymentRequiredGate — full-screen takeover for an established org whose
 * paid subscription hasn't started yet (subscription_status =
 * "payment_required"). Rendered by the dashboard layout INSTEAD of the
 * dashboard, so every page is behind it. One button: Stripe Checkout for
 * the Individual plan via /api/billing/activate (no trial, bills today).
 * The webhook flips the org to active on completion, so the next load of
 * /dashboard walks straight back in. Nothing is cancelled behind this
 * gate: monitoring keeps running and all data stays put.
 */

import { useEffect, useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function PaymentRequiredGate({ orgName }: { orgName: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);

  // Back from Stripe with ?payment=success but the webhook hasn't flipped
  // the org yet (this component only renders while still gated). Show the
  // activating state and re-render the server layout every few seconds —
  // the moment the flip lands, the layout stops returning the gate.
  // window.location (not useSearchParams) keeps this free of Suspense
  // requirements; it only runs client-side anyway.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("payment")) return;
    setActivating(true);
    const timer = setInterval(() => router.refresh(), 2500);
    const stop = setTimeout(() => {
      clearInterval(timer);
      setActivating(false);
    }, 90_000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [router]);

  async function startCheckout() {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const resp = await fetch("/api/billing/activate", { method: "POST" });
      const data = (await resp.json().catch(() => ({}))) as { url?: string };
      if (!resp.ok || !data.url) throw new Error("no url");
      window.location.href = data.url;
    } catch {
      setError("Couldn't open checkout. Try again.");
      setLoading(false);
    }
  }

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (activating) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg-base px-6 py-16">
        <div className="max-w-md text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-bg-elevated text-text-muted">
            <Loader2 size={20} strokeWidth={1.7} className="animate-spin" />
          </div>
          <h1 className="mt-6 font-display text-[1.4rem] font-medium tracking-tight text-text-primary">
            Payment received
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-text-secondary">
            Activating your workspace. This takes a few seconds.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-bg-base px-6 py-16">
      <div className="max-w-md text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-bg-elevated text-text-muted">
          <CreditCard size={20} strokeWidth={1.7} />
        </div>
        <h1 className="mt-6 font-display text-[1.4rem] font-medium tracking-tight text-text-primary">
          Set up your subscription
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-text-secondary">
          {orgName ? `${orgName} is` : "You're"} on the Individual plan.
          Complete payment to keep using Vera. Monitoring is
          still running and everything is exactly where you left it.
        </p>
        <button
          type="button"
          onClick={startCheckout}
          disabled={loading}
          className="mt-7 inline-flex items-center gap-2 rounded-lg bg-gradient-brand px-5 py-2.5 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : null}
          Continue to payment
        </button>
        {error ? (
          <p className="mt-3 text-[13px] text-red-500">{error}</p>
        ) : null}
        <div className="mt-8">
          <button
            type="button"
            onClick={handleSignOut}
            className="text-[13px] text-text-muted transition-colors hover:text-text-primary"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
