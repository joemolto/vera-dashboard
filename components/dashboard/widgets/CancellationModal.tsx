"use client";

/**
 * CancellationModal — the "before you go" pop-out. Three steps:
 *   1. reasons  — capture churn feedback (why they're leaving) FIRST.
 *   2. offer    — a retention save: 50% off next month.
 *   3. cancel   — only if they decline the offer (at period end).
 * Feedback is recorded whether they stay (via the discount endpoint) or
 * leave (via the cancel endpoint), so we always learn why.
 */

import { useState } from "react";
import { X, BadgePercent } from "lucide-react";
import { useOrg } from "@/components/dashboard/OrgContext";
import { claraApi } from "@/lib/dashboard/claraApi";
import { cn } from "@/lib/utils";

const REASONS = [
  { key: "price", label: "Too expensive" },
  { key: "value", label: "Not enough value" },
  { key: "missing_features", label: "Missing features I needed" },
  { key: "no_time", label: "Didn't get time to use it" },
  { key: "alternative", label: "Found a better tool" },
  { key: "too_complex", label: "Too hard to use" },
  { key: "just_trying", label: "Was just trying it out" },
  { key: "other", label: "Something else" },
];

type Step = "reasons" | "offer" | "stayed" | "done";

export function CancellationModal({ onClose }: { onClose: () => void }) {
  const { orgId } = useOrg();
  const [step, setStep] = useState<Step>("reasons");
  const [reasons, setReasons] = useState<string[]>([]);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stayedMsg, setStayedMsg] = useState("");

  const toggle = (k: string) =>
    setReasons((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  // Accept the 50%-off save: applies the discount, records the feedback, keeps them.
  const acceptDiscount = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await claraApi("/billing/retention-discount", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId, reasons, details: details.trim() }),
      });
      setStayedMsg(
        "Done — 50% off is applied to your next invoice. Glad you're staying.",
      );
      setStep("stayed");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't apply the discount. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Decline the offer → actually cancel at period end (feedback goes with it).
  const cancelPlan = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await claraApi("/billing/cancel", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId, reasons, details: details.trim() }),
      });
      setStep("done");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't cancel — try again, or use Manage billing.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const heading =
    step === "done"
      ? "Subscription cancelled"
      : step === "stayed"
        ? "You're staying"
        : step === "offer"
          ? "One more thing"
          : "Before you go";

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-8 backdrop-blur-sm sm:items-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="my-auto w-full max-w-lg overflow-hidden rounded-2xl border border-border-default bg-bg-base shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-7 py-5">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-text-muted">
            {heading}
          </span>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        {/* STEP: done (cancelled) */}
        {step === "done" && (
          <div className="px-7 py-8">
            <h2 className="text-[18px] font-semibold tracking-tight text-text-primary">
              Done — you&apos;re cancelled.
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-text-secondary">
              You&apos;ll keep full access until the end of your current billing
              period, then your plan ends — no further charges. Thanks for the
              feedback; it genuinely helps us make Vera better. You&apos;re
              welcome back any time.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 rounded-lg bg-gradient-brand px-5 py-2.5 text-[14px] font-medium text-bg-base hover:opacity-90"
            >
              Close
            </button>
          </div>
        )}

        {/* STEP: stayed (took an offer) */}
        {step === "stayed" && (
          <div className="px-7 py-8">
            <h2 className="text-[18px] font-semibold tracking-tight text-text-primary">
              Glad you&apos;re sticking around.
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-text-secondary">
              {stayedMsg}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 rounded-lg bg-gradient-brand px-5 py-2.5 text-[14px] font-medium text-bg-base hover:opacity-90"
            >
              Back to Vera
            </button>
          </div>
        )}

        {/* STEP: reasons */}
        {step === "reasons" && (
          <div className="px-7 py-7">
            <h2 className="text-[19px] font-semibold tracking-tight text-text-primary">
              Sorry to see you go.
            </h2>
            <p className="mt-1.5 text-[14px] text-text-secondary">
              Quick one before you cancel — what&apos;s driving it? (Pick any that apply.)
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => toggle(r.key)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                    reasons.includes(r.key)
                      ? "border-accent bg-accent/12 text-accent"
                      : "border-border-default text-text-secondary hover:border-accent/40 hover:text-text-primary",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <div className="mt-5">
              <label className="text-[13px] font-medium text-text-primary">
                Anything we could&apos;ve done better?{" "}
                <span className="text-text-muted">(optional)</span>
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                placeholder="The more honest, the more useful — thank you."
                className="mt-1.5 w-full resize-none rounded-lg border border-border-default bg-bg-card px-3.5 py-2.5 text-[14px] text-text-primary outline-none focus:border-accent/50"
              />
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                className="text-[13px] text-text-secondary transition-colors hover:text-text-primary"
              >
                Never mind, keep my plan
              </button>
              <button
                type="button"
                onClick={() => setStep("offer")}
                className="rounded-lg bg-gradient-brand px-5 py-2.5 text-[13.5px] font-medium text-bg-base transition-opacity hover:opacity-90"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* STEP: offer (retention save) */}
        {step === "offer" && (
          <div className="px-7 py-7">
            <h2 className="text-[19px] font-semibold tracking-tight text-text-primary">
              Before you go — can we make it right?
            </h2>
            <p className="mt-1.5 text-[14px] text-text-secondary">
              We&apos;d much rather fix it than lose you.
            </p>

            <div className="mt-5 space-y-3">
              {/* 50% off */}
              <div className="flex items-start gap-3.5 rounded-xl border border-accent/30 bg-accent/[0.06] p-4">
                <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
                  <BadgePercent size={18} strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-text-primary">
                    50% off your next month
                  </p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-text-secondary">
                    Stay on and your next invoice is half price — no strings.
                  </p>
                  <button
                    type="button"
                    onClick={acceptDiscount}
                    disabled={submitting}
                    className="mt-3 rounded-lg bg-gradient-brand px-4 py-2 text-[13px] font-medium text-bg-base transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {submitting ? "Applying…" : "Apply 50% off & stay"}
                  </button>
                </div>
              </div>
            </div>

            {error && <p className="mt-4 text-[13px] text-red-400">{error}</p>}

            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep("reasons")}
                className="text-[13px] text-text-muted transition-colors hover:text-text-primary"
              >
                Back
              </button>
              <button
                type="button"
                onClick={cancelPlan}
                disabled={submitting}
                className="rounded-lg border border-red-500/40 px-5 py-2.5 text-[13.5px] font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-60"
              >
                {submitting ? "Cancelling…" : "No thanks, cancel my plan"}
              </button>
            </div>
            <p className="mt-3 text-[11.5px] text-text-muted">
              If you cancel, you keep access until the end of your billing period. No further charges.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
