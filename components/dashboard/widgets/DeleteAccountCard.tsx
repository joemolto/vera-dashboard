"use client";

/**
 * DeleteAccountCard — the Settings "danger zone". Permanently erases the
 * org, all its data, and the user's login (GDPR right to erasure). This is
 * NOT cancellation: cancelling stops billing but keeps the data (it just
 * goes stale). Deleting removes everything, irreversibly.
 *
 * Gated hard: the customer must type their exact company name AND
 * slide-to-confirm before anything fires.
 */

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/dashboard/primitives";
import { useOrg } from "@/components/dashboard/OrgContext";
import { useDeleteAccount } from "@/lib/dashboard/queries";
import { SlideToConfirm } from "@/components/ui/SlideToConfirm";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function DeleteAccountCard() {
  const { orgName } = useOrg();
  const del = useDeleteAccount();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const nameMatches =
    confirmText.trim().toLowerCase() === (orgName || "").trim().toLowerCase();

  async function handleConfirm() {
    setError(null);
    try {
      await del.mutateAsync();
      // Data + login are gone — drop the local session and leave the app.
      await createSupabaseBrowserClient().auth.signOut();
      window.location.href = "/login";
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't delete the account — try again or contact support.",
      );
    }
  }

  return (
    <Card className="border-red-500/30 p-6 md:p-7">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-red-500/12 text-red-400">
          <AlertTriangle size={16} strokeWidth={1.8} />
        </div>
        <div className="min-w-0">
          <h3 className="text-[14px] font-medium text-text-primary">Delete account</h3>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-text-muted">
            Permanently deletes your organisation, every account and signal
            you&apos;ve gathered, your login, and your name and email. Deletion{" "}
            <span className="text-text-secondary">cannot be undone</span>.
          </p>

          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-4 rounded-lg border border-red-500/40 px-4 py-2 text-[13px] font-medium text-red-400 transition-colors hover:bg-red-500/10"
            >
              Delete my account
            </button>
          ) : (
            <div className="mt-4">
              <label className="block text-[12px] text-text-secondary">
                Type your company name <span className="text-text-primary">{orgName}</span> to confirm
              </label>
              <input
                type="text"
                autoFocus
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={orgName}
                className="mt-1.5 w-full max-w-xs rounded-lg border border-border-default bg-bg-elevated px-3.5 py-2.5 text-[14px] text-text-primary outline-none transition-colors focus:border-red-500/60 focus:ring-1 focus:ring-red-500/40"
              />

              {error && (
                <p className="mt-3 text-[12.5px] text-red-400" role="alert">
                  {error}
                </p>
              )}

              <div className="mt-4 flex items-center gap-4">
                {nameMatches ? (
                  <SlideToConfirm
                    text="Slide to permanently delete"
                    successText="Deleting…"
                    width={260}
                    height={36}
                    onConfirm={handleConfirm}
                  />
                ) : (
                  <span className="text-[12px] text-text-muted">
                    Enter the exact name to enable deletion.
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setConfirmText("");
                    setError(null);
                  }}
                  className="text-[13px] text-text-muted transition-colors hover:text-text-primary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
