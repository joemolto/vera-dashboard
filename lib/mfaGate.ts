import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Two-factor gate for server routes. Page redirects alone don't stop a
// password-only (aal1) session from calling these routes directly, and most
// of them act with the service role. Mirrors clara-api: a user who has a
// verified factor, or who belongs to an mfa_required org, must present an
// aal2 session. Fails closed: if the check can't complete, the request is refused.

function aalOf(accessToken: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"),
    );
    return typeof payload.aal === "string" ? payload.aal : null;
  } catch {
    return null;
  }
}

/** The access token behind a cookie-based server client. */
export async function sessionToken(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

/** True when this session still owes its two-factor code: block the request. */
export async function mfaMissing(accessToken: string, userId: string): Promise<boolean> {
  const token = accessToken.replace(/^Bearer\s+/i, "");
  if (aalOf(token) === "aal2") return false;
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: links } = await admin
      .from("org_users")
      .select("organisations:org_id (icp_config)")
      .eq("user_id", userId);
    const required = (links ?? []).some((l) => {
      const org = l.organisations as unknown as { icp_config?: { mfa_required?: boolean } } | null;
      return org?.icp_config?.mfa_required === true;
    });
    if (required) return true;
    const { data } = await admin.auth.admin.mfa.listFactors({ userId });
    return (data?.factors ?? []).some((f) => f.status === "verified");
  } catch {
    return true;
  }
}

export const MFA_REQUIRED_MESSAGE =
  "Two-factor authentication required. Enter your code on the login page.";
