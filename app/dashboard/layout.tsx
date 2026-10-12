import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { DashboardThemeWrapper } from "@/components/dashboard/DashboardThemeWrapper";
import { QueryProvider } from "@/components/dashboard/QueryProvider";
import { OrgProvider, type OrgFeatures } from "@/components/dashboard/OrgContext";
import { NoOrgScreen } from "@/components/dashboard/NoOrgScreen";
import { PaymentRequiredGate } from "@/components/dashboard/PaymentRequiredGate";
import { SoloOnboardingModal } from "@/components/onboarding/SoloOnboardingModal";
import { UpgradeGate } from "@/components/dashboard/UpgradeGate";
import { deriveFirstNameFromEmail } from "@/lib/dashboard/displayName";
import { SELF_HOSTED } from "@/lib/selfHosted";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // --- MFA gates (defensive — only redirect on a clear positive signal,
  // so an API hiccup never locks anyone out). getAuthenticatorAssuranceLevel
  // is a JWT decode (fast, no extra round-trip).
  //   nextLevel "aal1"            → user has no verified factor
  //   aal1 + nextLevel "aal2"     → has a factor but hasn't completed it
  //   currentLevel "aal2"         → fully authenticated
  let aal: { currentLevel: string | null; nextLevel: string | null } | null = null;
  try {
    aal = (await supabase.auth.mfa.getAuthenticatorAssuranceLevel()).data;
  } catch {
    aal = null;
  }
  // Gate 1: enrolled in MFA but session is still aal1 → finish the
  // challenge at login. Applies to every MFA user; existing users without
  // a factor (nextLevel "aal1") sail past untouched.
  if (aal && aal.currentLevel === "aal1" && aal.nextLevel === "aal2") {
    redirect("/login?mfa=1");
  }

  const { data: orgUser } = await supabase
    .from("org_users")
    .select("org_id, organisations:org_id (name, icp_config, subscription_status)")
    .eq("user_id", user.id)
    .maybeSingle();

  const email = user.email ?? "";

  // Display name resolution order:
  //   1. user_metadata.first_name (set via Settings → Account)
  //   2. user_metadata.full_name's first chunk (legacy / Stripe-derived)
  //   3. Email prefix heuristic — strip the +tag, split on . or -,
  //      capitalise the first chunk. So jane@x.com → "Jane",
  //      john.smith@acme.com → "John", jane+test@x → "Jane".
  // Customer can always override in Settings if the heuristic gets it
  // wrong (e.g. jsmith@... → "Jsmith").
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const metaFirst = typeof meta.first_name === "string" ? meta.first_name : "";
  const metaFull = typeof meta.full_name === "string" ? meta.full_name : "";
  const firstName =
    metaFirst ||
    (metaFull ? metaFull.split(" ")[0] : "") ||
    deriveFirstNameFromEmail(email);

  if (!orgUser?.org_id) {
    // The no-org screen still needs the OrgProvider because DashboardShell
    // reads feature flags off it to decide which nav items to show. Empty
    // defaults are fine here — no feature flags means the base nav only.
    return (
      <OrgProvider
        value={{
          orgId: "",
          orgName: "",
          userEmail: email,
          firstName,
          features: {},
        }}
      >
        <DashboardShell email={email} orgName="">
          <NoOrgScreen email={email} />
        </DashboardShell>
      </OrgProvider>
    );
  }

  const orgRow = orgUser.organisations as
    | {
        name?: string;
        subscription_status?: string | null;
        icp_config?: {
          features?: OrgFeatures;
          signal_priorities?: Record<string, number> | null;
          onboarding_completed?: boolean;
          mfa_required?: boolean;
          brand_domain?: string | null;
          logo_url?: string | null;
        } | null;
      }
    | null;
  const orgName = orgRow?.name ?? "";

  // Payment gate: an established org whose paid subscription hasn't
  // started yet sees ONLY the checkout screen — every dashboard page
  // waits behind it. Distinct from
  // the lapsed read-only state: nothing is cancelled, monitoring keeps
  // running, and the webhook flips the org to active the moment Stripe
  // confirms, so the next load walks straight back in.
  if (
    !SELF_HOSTED &&
    String(orgRow?.subscription_status ?? "").toLowerCase() === "payment_required"
  ) {
    return <PaymentRequiredGate orgName={orgName} />;
  }

  // Gate 2: org requires MFA (set on newly-provisioned orgs) and the user
  // has no factor yet → force enrolment first. Existing orgs have no
  // mfa_required flag, so their users are never sent here.
  if (orgRow?.icp_config?.mfa_required && aal && aal.nextLevel === "aal1") {
    redirect("/mfa-setup");
  }

  // Vera Solo: show the onboarding wizard as a modal over the dashboard
  // (not a separate page) until it's completed. The flag drives
  // SoloOnboardingModal, mounted below. Other tiers are unaffected.
  const onboardingPending = !!(
    orgRow?.icp_config?.features?.solo_plan &&
    !orgRow?.icp_config?.onboarding_completed
  );
  const features: OrgFeatures = { ...(orgRow?.icp_config?.features ?? {}) };
  // Relevance scoring is implicitly on when the org has weights
  // populated — no separate boolean to remember to flip. Clients
  // without weights stay on the global sales-lens whitelist.
  const priorities = orgRow?.icp_config?.signal_priorities;
  if (priorities && typeof priorities === "object" && Object.keys(priorities).length > 0) {
    features.signal_ranking = true;
  }

  return (
    <QueryProvider>
      <OrgProvider
        value={{
          orgId: orgUser.org_id,
          orgName,
          userEmail: email,
          domain: orgRow?.icp_config?.brand_domain ?? null,
          logoUrl: orgRow?.icp_config?.logo_url ?? null,
          firstName,
          features,
          subscriptionStatus: orgRow?.subscription_status ?? null,
          signalPriorities:
            priorities && typeof priorities === "object" ? priorities : undefined,
          onboardingPending,
        }}
      >
        {/* Premium light theme for intelligence-only orgs — but only while
            the chosen theme is light, so the Settings dark/light toggle
            actually works (see DashboardThemeWrapper). */}
        <DashboardThemeWrapper intelligenceOnly={!!features.intelligence_only}>
          <DashboardShell
            email={email}
            orgName={orgName}
            domain={orgRow?.icp_config?.brand_domain ?? null}
            logoUrl={orgRow?.icp_config?.logo_url ?? null}
          >
            {children}
          </DashboardShell>
          <SoloOnboardingModal />
          {!SELF_HOSTED && <UpgradeGate />}
        </DashboardThemeWrapper>
      </OrgProvider>
    </QueryProvider>
  );
}
