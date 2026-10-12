"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Plus, X, Zap } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrg } from "@/components/dashboard/OrgContext";
import { claraApi } from "@/lib/dashboard/claraApi";
import { SlideToConfirm } from "@/components/ui/SlideToConfirm";
import { cn } from "@/lib/utils";

interface Pack {
  key: "small" | "medium" | "large";
  credits: number;
  amount_cents: number;
  amount_display: string;
  price_per_credit_cents: number;
  label: string;
}

interface PacksResponse {
  packs: Pack[];
}

interface TopupCheckoutResponse {
  url: string;
  session_id: string;
  pack: string;
  credits: number;
  amount_cents: number;
}

type State =
  | { kind: "closed" }
  | { kind: "open" }
  | { kind: "redirecting"; pack: Pack }
  | { kind: "error"; message: string };

interface Props {
  /** Variant: 'button' renders a small inline pill, 'card' renders a full card */
  variant?: "button" | "card";
}

export function CreditTopUp({ variant = "button" }: Props) {
  const { orgId, orgName, userEmail } = useOrg();
  const qc = useQueryClient();
  const [state, setState] = useState<State>({ kind: "closed" });
  // Selected pack lives separately so the slide-to-confirm gesture is the
  // only action that actually triggers Stripe checkout. Tapping a pack
  // card now just highlights it.
  const [selectedKey, setSelectedKey] = useState<Pack["key"] | null>(null);

  // Fetch packs from backend (single source of truth for pricing)
  const { data: packsData, isLoading: packsLoading } = useQuery<PacksResponse>({
    queryKey: ["billing-topup-packs"],
    queryFn: () => claraApi<PacksResponse>("/billing/topup-packs", { method: "GET" }),
    staleTime: 60 * 60_000, // packs don't change often — cache an hour
  });

  const selectedPack =
    selectedKey && packsData?.packs.find((p) => p.key === selectedKey);

  const confirmTopUp = async () => {
    if (!selectedPack) return;
    setState({ kind: "redirecting", pack: selectedPack });
    try {
      const resp = await claraApi<TopupCheckoutResponse>(
        "/billing/create-topup-checkout",
        {
          method: "POST",
          body: JSON.stringify({
            org_id: orgId,
            email: userEmail,
            org_name: orgName,
            pack: selectedPack.key,
            success_url: `${window.location.origin}/dashboard?topup=success`,
            cancel_url: `${window.location.origin}/dashboard?topup=cancelled`,
          }),
        },
      );
      // Redirect the browser to the Stripe-hosted Checkout page
      window.location.href = resp.url;
      // Don't reset state — the page is navigating away
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start checkout";
      setState({ kind: "error", message: msg });
      // Re-throw so the SlideToConfirm component resets its thumb position
      throw err;
    }
  };

  const closeModal = () => {
    setState({ kind: "closed" });
    setSelectedKey(null);
  };

  const Trigger =
    variant === "card" ? (
      <button
        type="button"
        onClick={() => setState({ kind: "open" })}
        className="flex w-full items-center justify-between rounded-2xl border border-border-default bg-bg-card p-5 text-left transition-colors hover:border-border-strong hover:bg-bg-elevated/50"
      >
        <div>
          <div className="font-display text-[14px] font-medium tracking-tight text-text-primary">
            Top up enrichment credits
          </div>
          <div className="mt-1 text-[12.5px] text-text-secondary">
            Out of credits this month? Pick a pack — billed once, applied immediately.
          </div>
        </div>
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
          <Plus size={14} strokeWidth={2} />
        </div>
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setState({ kind: "open" })}
        className="inline-flex items-center gap-1.5 rounded-md border border-border-default bg-bg-base/50 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-muted transition-colors hover:border-border-strong hover:text-text-primary"
      >
        <Plus size={11} strokeWidth={1.8} />
        Top up credits
      </button>
    );

  return (
    <>
      {Trigger}
      <AnimatePresence>
        {state.kind === "open" || state.kind === "redirecting" || state.kind === "error" ? (
          <Modal onClose={closeModal}>
            <ModalHeader
              icon={<Zap size={16} strokeWidth={1.7} className="text-accent" />}
              title="Top up enrichment credits"
              subtitle={
                state.kind === "redirecting"
                  ? "Redirecting to secure Stripe checkout…"
                  : selectedPack
                    ? `Slide to confirm — ${selectedPack.credits} credits for ${selectedPack.amount_display}.`
                    : "Pick a pack — then slide to confirm. Credits land the moment payment clears."
              }
              onClose={closeModal}
            />

            {state.kind === "error" && (
              <div className="border-b border-border-subtle bg-red-500/5 px-7 py-3">
                <p className="text-[12.5px] text-red-500">
                  Couldn&apos;t start checkout: {state.message}
                </p>
              </div>
            )}

            <div className="px-7 py-6">
              {packsLoading ? (
                <div className="grid place-items-center py-10">
                  <Loader2 size={20} strokeWidth={2} className="animate-spin text-text-muted" />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {packsData?.packs.map((pack) => (
                    <PackCard
                      key={pack.key}
                      pack={pack}
                      selected={selectedKey === pack.key}
                      disabled={state.kind === "redirecting"}
                      onPick={() => setSelectedKey(pack.key)}
                    />
                  ))}
                </div>
              )}

              <p className="mt-6 text-[11.5px] leading-relaxed text-text-muted">
                Credits are added to your current month&apos;s allowance the
                moment Stripe confirms payment. They roll over with the rest
                of your monthly allowance &mdash; not separate bucket. Larger
                packs give a better per-credit rate.
              </p>
            </div>

            <div className="flex flex-col items-center gap-3 border-t border-border-subtle bg-bg-base/30 px-7 py-5 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full px-4 py-2 text-[13px] text-text-secondary transition-colors hover:text-text-primary"
              >
                Cancel
              </button>
              <SlideToConfirm
                key={selectedKey ?? "no-pack"}
                text={
                  selectedPack
                    ? `Slide to pay ${selectedPack.amount_display}`
                    : "Pick a pack to continue"
                }
                successText="Redirecting…"
                onConfirm={confirmTopUp}
                disabled={!selectedPack || state.kind === "redirecting"}
                width={300}
                height={52}
              />
            </div>
          </Modal>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function PackCard({
  pack,
  selected,
  disabled,
  onPick,
}: {
  pack: Pack;
  selected: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const perCreditDollars = (pack.price_per_credit_cents / 100).toFixed(2);
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "flex flex-col items-start rounded-2xl border p-5 text-left transition-colors",
        disabled && "cursor-wait opacity-70",
        selected
          ? "border-accent bg-accent/5"
          : "border-border-default bg-bg-card hover:border-border-strong hover:bg-bg-elevated/50",
      )}
    >
      <div className="flex w-full items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">
          {pack.key === "small"
            ? "Small pack"
            : pack.key === "medium"
              ? "Medium pack"
              : "Large pack"}
        </div>
        {selected && (
          <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-bg-base">
            <Plus size={11} strokeWidth={2.4} className="rotate-45" />
          </span>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display text-[1.6rem] font-medium tracking-tight text-text-primary">
          {pack.credits}
        </span>
        <span className="font-mono text-[11px] text-text-muted">credits</span>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-display text-[1.4rem] font-medium tracking-tight text-text-primary">
          {pack.amount_display}
        </span>
        <span className="font-mono text-[10.5px] text-text-muted">
          ${perCreditDollars}/credit
        </span>
      </div>
    </button>
  );
}

function Modal({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 grid place-items-center bg-bg-base/70 px-4 py-8 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border-default bg-bg-card"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function ModalHeader({
  icon,
  title,
  subtitle,
  onClose,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-7 py-5">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-bg-elevated">
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-[1.05rem] font-medium tracking-tight text-text-primary">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-bg-elevated/50 hover:text-text-primary"
      >
        <X size={12} strokeWidth={1.8} />
      </button>
    </div>
  );
}
