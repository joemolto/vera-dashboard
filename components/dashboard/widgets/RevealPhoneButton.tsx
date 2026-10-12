"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Copy, Loader2, Phone, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrg } from "@/components/dashboard/OrgContext";
import { claraApi } from "@/lib/dashboard/claraApi";
import { cn } from "@/lib/utils";

interface RevealPhoneResponse {
  status: "revealed" | "already_revealed" | "not_found";
  phone: string | null;
  credit_charged: boolean;
}

interface Props {
  leadId: string;
  /** Existing phone if already revealed — switches the UI into display mode */
  existingPhone?: string | null;
}

type State =
  | { kind: "idle" }
  | { kind: "confirm" }
  | { kind: "loading" }
  | { kind: "revealed"; phone: string; credit_charged: boolean }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

export function RevealPhoneButton({ leadId, existingPhone }: Props) {
  const { orgId, features } = useOrg();
  const isSolo = !!features.solo_plan; // caps-based: no credit copy
  const qc = useQueryClient();
  const [state, setState] = useState<State>(
    existingPhone
      ? { kind: "revealed", phone: existingPhone, credit_charged: false }
      : { kind: "idle" },
  );
  const [copied, setCopied] = useState(false);

  const onReveal = async () => {
    setState({ kind: "loading" });
    try {
      const resp = await claraApi<RevealPhoneResponse>(
        `/leads/${leadId}/reveal-phone`,
        {
          method: "POST",
          body: JSON.stringify({ org_id: orgId }),
        },
        // ~20s timeout — reveal can poll for up to 14s on Apollo's async path
        25_000,
      );
      if (resp.phone) {
        setState({
          kind: "revealed",
          phone: resp.phone,
          credit_charged: resp.credit_charged,
        });
        qc.invalidateQueries({ queryKey: ["lead", leadId] });
        qc.invalidateQueries({ queryKey: ["usage"] });
      } else {
        setState({ kind: "not_found" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Phone reveal failed";
      setState({ kind: "error", message: msg });
    }
  };

  const onCopy = async () => {
    if (state.kind !== "revealed") return;
    try {
      await navigator.clipboard.writeText(state.phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // silent
    }
  };

  // Phone already revealed (or just was) — show the number with copy button
  if (state.kind === "revealed") {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-border-subtle bg-bg-base/50 px-3 py-1.5">
        <Phone size={12} strokeWidth={1.7} className="text-text-muted" />
        <a
          href={`tel:${state.phone}`}
          className="text-[13px] tabular-nums text-text-primary underline-offset-4 hover:underline"
        >
          {state.phone}
        </a>
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy phone number"
          className={cn(
            "grid h-5 w-5 place-items-center rounded transition-colors",
            copied ? "text-accent" : "text-text-muted hover:text-text-primary",
          )}
        >
          {copied ? <Check size={11} strokeWidth={2.2} /> : <Copy size={11} strokeWidth={1.7} />}
        </button>
      </div>
    );
  }

  // Not found state — info message, allow retry
  if (state.kind === "not_found") {
    return (
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-muted">
          {isSolo ? "Phone not found" : "Phone not found · no credit charged"}
        </span>
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="text-[12px] text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  // Error state
  if (state.kind === "error") {
    return (
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-red-500">
          Reveal failed
        </span>
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="text-[12px] text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  // Idle: button to start; loading while polling Apollo; confirm modal between
  return (
    <>
      <button
        type="button"
        onClick={() => setState({ kind: "confirm" })}
        disabled={state.kind === "loading"}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-border-default bg-bg-base/50 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] transition-colors",
          state.kind === "loading"
            ? "cursor-wait text-text-muted"
            : "text-text-muted hover:border-border-strong hover:text-text-primary",
        )}
        aria-label="Reveal phone number for this lead"
      >
        {state.kind === "loading" ? (
          <>
            <Loader2 size={11} strokeWidth={2} className="animate-spin" />
            Revealing
          </>
        ) : (
          <>
            <Phone size={11} strokeWidth={1.8} />
            Reveal phone{isSolo ? "" : " · 1 credit"}
          </>
        )}
      </button>

      <AnimatePresence>
        {state.kind === "confirm" && (
          <ConfirmModal
            onCancel={() => setState({ kind: "idle" })}
            onConfirm={onReveal}
            isSolo={isSolo}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function ConfirmModal({
  onCancel,
  onConfirm,
  isSolo,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  isSolo: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 grid place-items-center bg-bg-base/70 px-4 backdrop-blur-sm"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-border-default bg-bg-card p-7"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-bg-elevated">
            <Phone size={16} strokeWidth={1.7} className="text-accent" />
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded-md text-text-muted transition-colors hover:bg-bg-elevated/50 hover:text-text-primary"
          >
            <X size={12} strokeWidth={1.8} />
          </button>
        </div>

        <h3 className="mt-5 font-display text-[1.15rem] font-medium tracking-tight text-text-primary">
          Reveal phone number?
        </h3>

        <p className="mt-3 text-[13.5px] leading-relaxed text-text-secondary">
          {isSolo ? (
            <>
              This reveals the contact&apos;s direct phone number. Phone
              numbers aren&apos;t always available.
            </>
          ) : (
            <>
              This will use{" "}
              <span className="font-medium text-text-primary">
                1 enrichment credit
              </span>
              . Phone numbers aren&apos;t always available —{" "}
              <span className="font-medium text-text-primary">
                no credit charged if not found
              </span>
              .
            </>
          )}
        </p>

        <div className="mt-7 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-[13px] text-text-secondary transition-colors hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 rounded-full bg-text-primary px-5 py-2 text-[13px] font-medium tracking-tight text-bg-base transition-opacity hover:opacity-90"
          >
            <Phone size={12} strokeWidth={1.8} />
            Reveal{isSolo ? "" : " — 1 credit"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
