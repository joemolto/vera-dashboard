"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Mode = "request" | "set";

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get("code");
  const [mode, setMode] = useState<Mode>(code ? "set" : "request");

  useEffect(() => {
    setMode(code ? "set" : "request");
  }, [code]);

  if (mode === "set") return <SetPasswordForm />;
  return <RequestResetForm />;
}

function RequestResetForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const supabase = createSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent/15 text-accent">
          <CheckCircle2 size={20} strokeWidth={1.7} />
        </div>
        <h1 className="mt-5 font-display text-[1.25rem] font-medium tracking-tight text-text-primary">
          Check your email
        </h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-text-secondary">
          We sent a reset link to{" "}
          <span className="text-text-primary">{email}</span>. The link expires
          in one hour.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <div className="text-xs font-medium text-text-muted">
          Reset password
        </div>
        <h1 className="mt-3 font-display text-[1.25rem] font-medium tracking-tight text-text-primary">
          Forgot it? Happens.
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
          Enter your email and we&apos;ll send you a link to set a new one.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label
            htmlFor="email"
            className="mb-1.5 block text-xs font-medium text-text-secondary"
          >
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
            className="w-full rounded-lg border border-border-default bg-bg-elevated px-3.5 py-2.5 text-[14px] text-text-primary placeholder:text-text-muted/70 outline-none transition-colors focus:border-[#7c3aed] focus:ring-1 focus:ring-[#7c3aed]"
          />
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-red-600"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-[#7c3aed] px-4 py-2.5 text-[13.5px] font-medium tracking-tight text-white transition-colors hover:bg-[#6d31d9] disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <ArrowRight size={14} />
          )}
          {submitting ? "Sending…" : "Send reset link"}
        </button>
      </form>
    </>
  );
}

function SetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <>
      <div className="mb-6">
        <div className="text-xs font-medium text-text-muted">
          Set new password
        </div>
        <h1 className="mt-3 font-display text-[1.25rem] font-medium tracking-tight text-text-primary">
          Pick a new one
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
          At least 8 characters. We&apos;ll log you in straight after.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">
            New password
          </label>
          <input
            type="password"
            required
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border-default bg-bg-elevated px-3.5 py-2.5 text-[14px] text-text-primary outline-none transition-colors focus:border-[#7c3aed] focus:ring-1 focus:ring-[#7c3aed]"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">
            Confirm
          </label>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-lg border border-border-default bg-bg-elevated px-3.5 py-2.5 text-[14px] text-text-primary outline-none transition-colors focus:border-[#7c3aed] focus:ring-1 focus:ring-[#7c3aed]"
          />
        </div>
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-red-600"
          >
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-[#7c3aed] px-4 py-2.5 text-[13.5px] font-medium tracking-tight text-white transition-colors hover:bg-[#6d31d9] disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <ArrowRight size={14} />
          )}
          {submitting ? "Updating…" : "Set password"}
        </button>
      </form>
    </>
  );
}
