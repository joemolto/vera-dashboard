import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mfaMissing, sessionToken, MFA_REQUIRED_MESSAGE } from "@/lib/mfaGate";

export const runtime = "nodejs";

// HubSpot OAuth scopes — CRM contact/company read/write only. No email
// sending, no owners, no settings. Must match the app's configured scopes
// exactly or HubSpot rejects the authorize URL.
const SCOPES = [
  // The app's required scopes must ALL be requested or HubSpot rejects
  // the authorize URL. "oauth" is the new platform's baseline scope.
  "oauth",
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "crm.objects.companies.read",
  "crm.objects.companies.write",
].join(" ");

// Kick off the HubSpot OAuth flow. Mirrors the Slack connect route: requires
// a logged-in user, sets a random CSRF `state` (also an httpOnly cookie) that
// the callback validates before exchanging the code.
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/dashboard", req.url));
  if (await mfaMissing(await sessionToken(supabase), user.id)) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  const clientId = process.env.HUBSPOT_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      new URL("/dashboard/integrations?error=not_configured", req.url),
    );
  }

  const base = process.env.INTEGRATIONS_BASE_URL ?? new URL(req.url).origin;
  const redirectUri = `${base}/api/integrations/hubspot/callback`;
  const state = crypto.randomUUID();

  const authUrl = new URL("https://app.hubspot.com/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(authUrl.toString());
  res.cookies.set("hubspot_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
