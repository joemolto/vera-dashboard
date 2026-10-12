"use client";

/**
 * MfaSettings — the "Two-factor authentication" control in Settings.
 * Shows current status, lets a user enrol (TOTP) or remove their factor.
 * Available to every user.
 */

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { MfaEnroll } from "@/components/dashboard/widgets/MfaEnroll";

export function MfaSettings() {
  const [status, setStatus] = useState<"loading" | "on" | "off">("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [removing, setRemoving] = useState(false);

  const refresh = async () => {
    const sb = createSupabaseBrowserClient();
    const { data } = await sb.auth.mfa.listFactors();
    const totp = (data?.totp ?? []).find((f) => f.status === "verified");
    if (totp) {
      setStatus("on");
      setFactorId(totp.id);
    } else {
      setStatus("off");
      setFactorId(null);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const remove = async () => {
    if (!factorId) return;
    setRemoving(true);
    const sb = createSupabaseBrowserClient();
    await sb.auth.mfa.unenroll({ factorId });
    setRemoving(false);
    setEnrolling(false);
    await refresh();
  };

  return (
    <div className="mt-3 rounded-lg border border-border-subtle px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[13px] text-text-secondary">
          {status === "on" ? (
            <ShieldCheck size={14} className="text-accent" strokeWidth={1.8} />
          ) : (
            <ShieldAlert size={14} className="text-text-muted" strokeWidth={1.8} />
          )}
          Two-factor authentication
        </span>
        {status === "loading" ? (
          <Loader2 size={13} className="animate-spin text-text-muted" />
        ) : status === "on" ? (
          <span className="text-[11.5px] font-medium text-accent">On</span>
        ) : (
          <span className="text-[11.5px] text-text-muted">Off</span>
        )}
      </div>

      {status === "off" && !enrolling && (
        <button
          type="button"
          onClick={() => setEnrolling(true)}
          className="mt-3 rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-bg-base transition-opacity hover:opacity-90"
        >
          Set up two-factor
        </button>
      )}

      {status === "off" && enrolling && (
        <div className="mt-4">
          <MfaEnroll
            onComplete={() => {
              setEnrolling(false);
              refresh();
            }}
            onCancel={() => setEnrolling(false)}
          />
          <button
            type="button"
            onClick={() => setEnrolling(false)}
            className="mt-3 text-[12.5px] text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
        </div>
      )}

      {status === "on" && (
        <div className="mt-2">
          <p className="text-[11.5px] text-text-muted">
            You&apos;ll be asked for a code from your authenticator each time you sign in.
          </p>
          <button
            type="button"
            onClick={remove}
            disabled={removing}
            className="mt-2 text-[12px] text-text-muted underline-offset-2 transition-colors hover:text-red-400 hover:underline disabled:opacity-50"
          >
            {removing ? "Removing…" : "Remove two-factor"}
          </button>
        </div>
      )}
    </div>
  );
}
