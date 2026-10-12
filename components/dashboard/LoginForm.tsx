"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const labelCls = "mb-1.5 block text-xs font-medium text-text-secondary";
const inputCls =
  "w-full rounded-lg border border-border-default bg-bg-elevated px-3.5 py-2.5 text-[14px] text-text-primary placeholder:text-text-muted/70 outline-none transition-colors focus:border-[#7c3aed] focus:ring-1 focus:ring-[#7c3aed]";
const buttonCls =
  "mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-[#7c3aed] px-4 py-2.5 text-[13.5px] font-medium tracking-tight text-white transition-colors hover:bg-[#6d31d9] disabled:opacity-50";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Only allow same-origin redirects. A raw `next` lets a crafted link
  // (?next=//evil.com, ?next=https://evil.com, or "/<tab>/evil.com", which
  // the URL parser turns into "//evil.com") bounce the user to an attacker's
  // site after login — so resolve it against this origin and keep it only if
  // it stays here. Called at redirect time, in the browser.
  function safeNext(): string {
    const raw = searchParams.get("next") || "/dashboard";
    try {
      const url = new URL(raw, window.location.origin);
      if (url.origin === window.location.origin) return url.pathname + url.search;
    } catch {
      /* fall through */
    }
    return "/dashboard";
  }

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // MFA challenge stage — only entered when the signed-in user actually
  // has a verified factor. Users without MFA never see this. The reset
  // stage sends the password-reset email (lands on /reset-password),
  // mirroring the marketing site's login modal.
  const [stage, setStage] = useState<"password" | "mfa" | "reset">("password");
  const [resetSent, setResetSent] = useState(false);
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);

  // If we arrive already partly signed-in (aal1) with MFA pending — e.g.
  // redirected here by the dashboard's aal2 gate — go straight to the
  // code step instead of asking for the password again.
  useEffect(() => {
    (async () => {
      const sb = createSupabaseBrowserClient();
      const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2") {
        const { data: factors } = await sb.auth.mfa.listFactors();
        const totp = (factors?.totp ?? []).find((f) => f.status === "verified");
        if (totp) {
          setFactorId(totp.id);
          setStage("mfa");
        }
      }
    })();
  }, []);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setError(signInError.message);
      setSubmitting(false);
      return;
    }

    // Does this user have MFA? If so, require the code before proceeding.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2") {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = (factors?.totp ?? []).find((f) => f.status === "verified");
      if (totp) {
        setFactorId(totp.id);
        setStage("mfa");
        setSubmitting(false);
        return;
      }
    }

    // No MFA → straight in (existing behaviour, unchanged).
    router.replace(safeNext());
    router.refresh();
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || code.trim().length < 6) return;
    setError(null);
    setSubmitting(true);

    const supabase = createSupabaseBrowserClient();
    const ch = await supabase.auth.mfa.challenge({ factorId });
    if (ch.error || !ch.data) {
      setError(ch.error?.message ?? "Couldn't verify. Try again.");
      setSubmitting(false);
      return;
    }
    const v = await supabase.auth.mfa.verify({
      factorId,
      challengeId: ch.data.id,
      code: code.trim(),
    });
    if (v.error) {
      setError("That code didn't match. Check your authenticator and try the current one.");
      setCode("");
      setSubmitting(false);
      return;
    }

    router.replace(safeNext());
    router.refresh();
  }

  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const supabase = createSupabaseBrowserClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${window.location.origin}/reset-password` },
    );
    setSubmitting(false);
    if (resetError) {
      setError(resetError.message || "Couldn't send the reset link. Try again.");
      return;
    }
    setResetSent(true);
  }

  if (stage === "mfa") {
    return (
      <form onSubmit={handleMfaSubmit} className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-[13px] text-text-secondary">
          <ShieldCheck size={15} className="text-[#7c3aed]" strokeWidth={1.8} />
          Enter the 6-digit code from your authenticator.
        </div>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="123456"
          className="w-full rounded-lg border border-border-default bg-bg-elevated px-3.5 py-2.5 text-center font-mono text-[18px] tracking-[0.3em] text-text-primary outline-none transition-colors focus:border-[#7c3aed] focus:ring-1 focus:ring-[#7c3aed]"
        />
        {error && (
          <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-red-600">
            {error}
          </div>
        )}
        <button type="submit" disabled={submitting || code.length < 6} className={buttonCls}>
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
          {submitting ? "Verifying…" : "Verify & sign in"}
        </button>
      </form>
    );
  }

  if (stage === "reset") {
    return (
      <form onSubmit={handleResetSubmit} className="flex flex-col gap-4">
        {resetSent ? (
          <p className="text-[13.5px] leading-relaxed text-text-secondary">
            Check your inbox. If an account exists for {email.trim() || "that address"},
            a reset link is on its way.
          </p>
        ) : (
          <div>
            <label htmlFor="reset-email" className={labelCls}>
              Email
            </label>
            <input
              id="reset-email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className={inputCls}
            />
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-red-600">
            {error}
          </div>
        )}
        {!resetSent && (
          <button type="submit" disabled={submitting} className={buttonCls}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
            {submitting ? "Sending…" : "Send reset link"}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setStage("password");
            setResetSent(false);
            setError(null);
          }}
          className="text-left text-[12.5px] text-text-muted transition-colors hover:text-text-secondary"
        >
          ← Back to sign in
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="email" className={labelCls}>
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className={inputCls}
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor="password" className="block text-xs font-medium text-text-secondary">
            Password
          </label>
          <button
            type="button"
            onClick={() => {
              setStage("reset");
              setError(null);
            }}
            className="text-xs text-text-muted transition-colors hover:text-text-secondary"
          >
            Forgot password?
          </button>
        </div>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className={`${inputCls} pr-10`}
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((s) => !s)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-text-muted transition-colors hover:text-text-secondary"
          >
            {showPassword ? <EyeOff size={15} strokeWidth={1.8} /> : <Eye size={15} strokeWidth={1.8} />}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-red-600"
        >
          {error}
        </div>
      )}

      <button type="submit" disabled={submitting} className={buttonCls}>
        {submitting ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <ArrowRight size={14} />
        )}
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
