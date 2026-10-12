"use client";

/**
 * MfaEnroll — TOTP (authenticator-app) enrolment. Enrols a factor on
 * mount, shows the QR + manual secret, then verifies a 6-digit code.
 * Used both in Settings (optional enable) and the forced-setup gate for
 * new customers.
 *
 * Security choice: TOTP only — no SMS (SIM-swap, NIST-deprecated) and no
 * email codes (same inbox as the password reset = not a real 2nd factor).
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Stage = "loading" | "scan" | "verifying" | "error";

export function MfaEnroll({
  onComplete,
  onCancel,
}: {
  onComplete: () => void;
  onCancel?: () => void;
}) {
  const [stage, setStage] = useState<Stage>("loading");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const sb = createSupabaseBrowserClient();
      // Clear any half-finished (unverified) TOTP factor so re-tries don't
      // pile up "factor already exists" errors.
      try {
        const { data: f } = await sb.auth.mfa.listFactors();
        const stale = (f?.all ?? []).filter(
          (x) => x.factor_type === "totp" && x.status === "unverified",
        );
        for (const s of stale) await sb.auth.mfa.unenroll({ factorId: s.id });
      } catch {
        /* best-effort */
      }
      // Explicit issuer so the authenticator shows a clean "Vera" label
      // instead of whatever host we're on (localhost in dev, the domain
      // in prod). Cosmetic only — doesn't affect the secret or codes.
      const { data, error: enrollErr } = await sb.auth.mfa.enroll({
        factorType: "totp",
        issuer: "Vera",
      });
      if (enrollErr || !data) {
        setError(enrollErr?.message ?? "Couldn't start setup. Try again.");
        setStage("error");
        return;
      }
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
      setStage("scan");
    })();
  }, []);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 6) return;
    setStage("verifying");
    setError(null);
    const sb = createSupabaseBrowserClient();
    const ch = await sb.auth.mfa.challenge({ factorId });
    if (ch.error || !ch.data) {
      setError(ch.error?.message ?? "Verification failed. Try again.");
      setStage("scan");
      return;
    }
    const v = await sb.auth.mfa.verify({
      factorId,
      challengeId: ch.data.id,
      code: code.trim(),
    });
    if (v.error) {
      setError("That code didn't match — check the time on your device and try the current code.");
      setStage("scan");
      setCode("");
      return;
    }
    onComplete();
  };

  if (stage === "loading") {
    return (
      <div className="flex items-center gap-2 py-6 text-[13px] text-text-muted">
        <Loader2 size={14} className="animate-spin" /> Preparing your setup…
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div className="py-4">
        <p className="text-[13px] text-red-400">{error}</p>
        {onCancel && (
          <button onClick={onCancel} className="mt-3 text-[13px] text-text-secondary hover:text-text-primary">
            Close
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <ol className="mb-4 space-y-1.5 text-[13px] text-text-secondary">
        <li>1. Open your phone&apos;s built-in authenticator, your password manager (1Password, iCloud Keychain), or any authenticator app.</li>
        <li>2. Scan this code (or enter the key by hand).</li>
        <li>3. Type the 6-digit code it shows.</li>
      </ol>

      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        {/* Supabase returns the QR as raw SVG markup (incl. an XML
            prolog). Wrap it in a data URI and render as an image so it's
            sized by the element, not the SVG's own dimensions. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={
            qr.startsWith("data:")
              ? qr
              : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`
          }
          alt="Authenticator QR code"
          width={160}
          height={160}
          className="h-40 w-40 shrink-0 rounded-lg border border-border-default bg-white p-2"
        />
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-text-muted">Can&apos;t scan? Enter this key</div>
          <code className="mt-1 block break-all rounded-md bg-bg-elevated px-2.5 py-1.5 font-mono text-[12px] text-text-primary">
            {secret}
          </code>
        </div>
      </div>

      <form onSubmit={verify} className="mt-5">
        <label className="text-[12px] font-medium text-text-secondary">6-digit code</label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            autoFocus
            className="w-32 rounded-lg border border-border-default bg-bg-card px-3.5 py-2.5 text-center font-mono text-[16px] tracking-[0.3em] text-text-primary outline-none focus:border-accent/50"
          />
          <button
            type="submit"
            disabled={stage === "verifying" || code.length < 6}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-[14px] font-medium text-bg-base transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {stage === "verifying" ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            Verify
          </button>
        </div>
        {error && <p className="mt-2 text-[12.5px] text-red-400">{error}</p>}
      </form>
    </div>
  );
}
