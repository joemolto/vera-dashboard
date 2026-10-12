import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MfaSetupClient } from "./MfaSetupClient";

export const metadata: Metadata = {
  title: "Set up two-factor",
  robots: { index: false, follow: false },
};

// Forced MFA enrolment for newly-provisioned orgs. The dashboard layout
// sends no-factor users here; once enrolled (session → aal2) they go to
// the dashboard. Lives outside the dashboard layout so the gate can't loop.
export default async function MfaSetupPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Already has a factor? Nothing to do here — let the normal gates handle
  // completing the challenge.
  // (redirect() throws, so it must run outside the try.)
  let enrolled = false;
  try {
    const aal = (await supabase.auth.mfa.getAuthenticatorAssuranceLevel()).data;
    enrolled = aal?.nextLevel === "aal2";
  } catch {
    /* fall through to the enrol screen */
  }
  if (enrolled) redirect("/dashboard");

  return <MfaSetupClient />;
}
