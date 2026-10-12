"use client";

import { Building2, Check, KeyRound, Loader2, LogOut, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Card,
  PageHeader,
  PageShell,
  Pill,
  SectionHeader,
  Shimmer,
} from "@/components/dashboard/primitives";
import { useOrg } from "@/components/dashboard/OrgContext";
import { useOrganisation } from "@/lib/dashboard/queries";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { UsageMeter } from "@/components/dashboard/widgets/UsageMeter";
import { CreditTopUp } from "@/components/dashboard/widgets/CreditTopUp";
import { SoloCapBar } from "@/components/dashboard/widgets/SoloCapBar";
import { SoloCapacityCards } from "@/components/dashboard/widgets/SoloCapacityCards";
import { StarterPlanCard } from "@/components/dashboard/widgets/StarterUpgrade";
import { BillingCard } from "@/components/dashboard/widgets/BillingCard";
import { MfaSettings } from "@/components/dashboard/widgets/MfaSettings";
import { DeleteAccountCard } from "@/components/dashboard/widgets/DeleteAccountCard";
import { ThemeChooser } from "@/components/dashboard/widgets/ThemeChooser";
import { SignalCategoriesCard } from "@/components/dashboard/widgets/SignalCategoriesCard";
import { DealEconomicsCard } from "@/components/dashboard/widgets/DealEconomicsCard";
import { BuyerProfilesCard } from "@/components/dashboard/widgets/BuyerProfilesCard";
import { TargetRolesCard } from "@/components/dashboard/widgets/TargetRolesCard";
import { BrainModeCard } from "@/components/dashboard/widgets/BrainModeCard";
import { WorkspaceLogoCard } from "@/components/dashboard/widgets/WorkspaceLogoCard";
import { SELF_HOSTED } from "@/lib/selfHosted";

export default function SettingsPage() {
  const { userEmail, orgName, features } = useOrg();
  const { data: org, isLoading } = useOrganisation();
  const router = useRouter();

  // Vera Solo is sold on caps, not credits — so the credit-era surfaces
  // (enrichment meter, top-ups, buyer-profile editor, Brain autonomy,
  // API/MCP/webhooks) don't apply and are hidden. Solo sees its caps +
  // billing instead.
  const isSolo = !!features.solo_plan;

  // No client-side tier gate for API + webhooks. The engine is the
  // single source of truth — ApiKeysCard / WebhooksCard render off the
  // `tier_allowed` flag the API returns, and now show their own muted
  // "available on any paid plan" empty state when an org isn't eligible.
  // The old client check here was a stacked gate that silently overrode
  // the engine and locked Scout users out even after the engine allowed
  // them. Don't reintroduce it.

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Settings"
        title="Workspace & account"
        subtitle="Read-only for now. Editing lands with the next build."
      />

      {/* Buyer profiles + Brain autonomy are credit-tier concepts — the
          Solo ICP comes from the onboarding wizard, so these are hidden
          for Solo. Solo still needs to edit its target job titles after
          onboarding (the market page covers industries/locations/size
          but not roles), so it gets the slim TargetRolesCard instead. */}
      {isSolo ? (
        <div className="mt-10">
          <TargetRolesCard />
        </div>
      ) : (
        <>
          <div className="mt-10">
            <BuyerProfilesCard />
          </div>
          <div className="mt-5">
            <BrainModeCard />
          </div>
        </>
      )}

      {/* Plan & usage — caps plans show their caps (accounts / watched /
          unlocks); credit tiers show the enrichment meter + top-ups.
          Starter gets the upgrade card instead of capacity packs (packs
          are an Individual lever; the engine rejects them for Starter). */}
      {SELF_HOSTED ? null : isSolo ? (
        <>
          <div className="mt-5">
            <SoloCapBar />
          </div>
          <div className="mt-5">
            {features.starter_plan ? <StarterPlanCard /> : <SoloCapacityCards />}
          </div>
        </>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-[1fr_auto] md:items-stretch">
          <UsageMeter variant="card" />
          <div className="md:max-w-xs">
            <CreditTopUp variant="card" />
          </div>
        </div>
      )}

      {/* Billing — manage subscription / card / invoices via Stripe.
          Shown to every paid org (previously missing entirely). */}
      {!SELF_HOSTED && (
        <div className="mt-5">
          <BillingCard />
        </div>
      )}

      <div className="mt-5">
        <ThemeChooser />
      </div>

      {/* Deal economics — average deal size + currency. Drives the
          "Est. deal value" column. Available to every tier. */}
      <div className="mt-5">
        <DealEconomicsCard />
      </div>

      {/* Signal categories: 18 granular toggles — the credit-tier control.
          For Solo this duplicates the wizard's 5 signal groups and is too
          much, so it's hidden; the wizard is Solo's
          signal surface. A slim Solo signals card can come later. */}
      {!isSolo && (
        <div className="mt-5">
          <SignalCategoriesCard />
        </div>
      )}

      {/* API / MCP / webhook management moved to the Integrations page
          (2026-07-14) — same cards, same gating, one home. */}

      <div className="mt-5">
        <WorkspaceLogoCard />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
        <Card delay={0.1} className="p-6 md:p-7">
          <SectionHeader title="Workspace" />
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-bg-elevated text-text-secondary">
              <Building2 size={16} strokeWidth={1.7} />
            </div>
            <div className="min-w-0">
              <div className="font-display text-[15px] font-medium tracking-tight text-text-primary">
                {orgName || "—"}
              </div>
              <div className="mt-0.5 text-[12px] text-text-muted">
                {isLoading ? <Shimmer className="h-3 w-32" /> : org?.domain ?? "—"}
              </div>
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-3">
            {!SELF_HOSTED && (
              <Field
                label="Tier"
                value={isLoading ? null : org?.tier ?? "—"}
              />
            )}
            <Field
              label="Industry"
              value={isLoading ? null : org?.industry ?? "—"}
            />
            {!isSolo && !SELF_HOSTED && (
              <Field
                label="Enrichment limit"
                value={
                  isLoading
                    ? null
                    : org?.monthly_enrichment_limit
                      ? `${org.monthly_enrichment_limit} / month`
                      : "—"
                }
              />
            )}
            <Field
              label="Workspace ID"
              value={
                isLoading ? null : (
                  <span className="font-mono text-[10.5px]">
                    {org?.id?.slice(0, 8) ?? "—"}…
                  </span>
                )
              }
            />
          </dl>
        </Card>

        <Card delay={0.15} className="p-6 md:p-7">
          <SectionHeader title="Account" />
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-bg-elevated text-text-secondary">
              <User size={16} strokeWidth={1.7} />
            </div>
            <div className="min-w-0">
              <div className="truncate font-display text-[14.5px] font-medium tracking-tight text-text-primary">
                {userEmail}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <Pill variant="muted">viewer</Pill>
                <span className="text-[11.5px] text-text-muted">role</span>
              </div>
            </div>
          </div>

          <DisplayNameField />

          <ChangePasswordField />

          <MfaSettings />

          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle px-4 py-3 text-left text-[13px] text-text-secondary transition-colors hover:border-border-default hover:bg-bg-elevated/40 hover:text-text-primary"
            >
              <span className="flex items-center gap-2.5">
                <LogOut size={13} strokeWidth={1.7} />
                Sign out
              </span>
            </button>
          </div>
        </Card>
      </div>

      <div className="mt-5">
        <DeleteAccountCard />
      </div>
    </PageShell>
  );
}


function ChangePasswordField() {
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (pwd.length < 8) {
      setError("Password must be at least 8 characters.");
      setStatus("error");
      return;
    }
    if (pwd !== confirm) {
      setError("Passwords don't match.");
      setStatus("error");
      return;
    }
    setStatus("saving");
    const supabase = createSupabaseBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password: pwd });
    if (updateError) {
      setError(updateError.message || "Couldn't update password.");
      setStatus("error");
      return;
    }
    setStatus("saved");
    setPwd("");
    setConfirm("");
    setTimeout(() => {
      setStatus("idle");
      setOpen(false);
    }, 1800);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-border-subtle px-4 py-3 text-left text-[13px] text-text-secondary transition-colors hover:border-border-default hover:bg-bg-elevated/40 hover:text-text-primary"
      >
        <span className="flex items-center gap-2.5">
          <KeyRound size={13} strokeWidth={1.7} />
          Change password
        </span>
      </button>
    );
  }

  return (
    <div className="mt-5 rounded-xl border border-border-subtle bg-bg-elevated/30 px-4 py-3">
      <div className="flex items-center gap-2.5">
        <KeyRound size={13} strokeWidth={1.7} className="text-text-muted" />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
          Change password
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <input
          type="password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          placeholder="New password (min 8 characters)"
          className="rounded-lg border border-border-default bg-bg-elevated px-3 py-2 text-[13px] text-text-primary outline-none transition-colors focus:border-accent/60 placeholder:text-text-muted"
          autoComplete="new-password"
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Confirm new password"
          className="rounded-lg border border-border-default bg-bg-elevated px-3 py-2 text-[13px] text-text-primary outline-none transition-colors focus:border-accent/60 placeholder:text-text-muted"
          autoComplete="new-password"
        />
      </div>
      {error && (
        <p className="mt-2 text-[11.5px] text-state-danger">{error}</p>
      )}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setPwd("");
            setConfirm("");
            setError("");
            setStatus("idle");
          }}
          className="rounded-lg px-3 py-1.5 text-[12px] text-text-muted transition-colors hover:text-text-secondary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={status === "saving" || !pwd || !confirm}
          className="flex items-center gap-2 rounded-lg bg-text-primary px-4 py-1.5 text-[12px] font-medium text-bg-base transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "saving" && <Loader2 size={12} strokeWidth={2} className="animate-spin" />}
          {status === "saved" && <Check size={12} strokeWidth={2} />}
          {status === "saving" ? "Updating…" : status === "saved" ? "Password updated" : "Update password"}
        </button>
      </div>
    </div>
  );
}

function DisplayNameField() {
  const { firstName, userEmail } = useOrg();
  const router = useRouter();
  const [value, setValue] = useState(firstName);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save() {
    const trimmed = value.trim();
    if (trimmed === firstName) return;

    setStatus("saving");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({
      data: { first_name: trimmed },
    });
    if (error) {
      console.error("Failed to update display name:", error);
      setStatus("error");
      return;
    }
    setStatus("saved");
    // Layout reads from getUser() on every render so a refresh picks up
    // the new metadata across the dashboard (greeting included).
    router.refresh();
    setTimeout(() => setStatus("idle"), 1800);
  }

  return (
    <div className="mt-5 rounded-xl border border-border-subtle bg-bg-elevated/30 px-4 py-3">
      <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
        Display name
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          placeholder={firstName || userEmail.split("@")[0] || "Your name"}
          className="flex-1 bg-transparent text-[13px] tracking-tight text-text-primary outline-none placeholder:text-text-muted"
          maxLength={60}
        />
        {status === "saving" && (
          <Loader2 size={13} strokeWidth={1.7} className="animate-spin text-text-muted" />
        )}
        {status === "saved" && (
          <Check size={13} strokeWidth={2} className="text-accent" />
        )}
        {status === "error" && (
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-state-danger">
            failed
          </span>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-text-muted">
        Used in your dashboard greeting. Falls back to your email prefix
        when blank.
      </p>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-bg-elevated/30 px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
        {label}
      </div>
      <div className="mt-1 text-[13px] tracking-tight text-text-primary">
        {value === null ? <Shimmer className="h-4 w-20" /> : value}
      </div>
    </div>
  );
}
