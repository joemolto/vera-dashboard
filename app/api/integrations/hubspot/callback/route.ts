import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mfaMissing, sessionToken, MFA_REQUIRED_MESSAGE } from "@/lib/mfaGate";

export const runtime = "nodejs";

// HubSpot redirects here after the user authorises. We validate the CSRF
// state, exchange the code for tokens, and store them against the user's org.
//
// Token model (unlike Slack's forever-webhook): HubSpot access tokens expire
// in ~30 minutes; the refresh token is the durable credential. Both go in
// `secret` as a JSON blob — that column is never selected by the browser
// (lib/dashboard/integrations.ts reads display columns only) and the engine
// refreshes + rewrites it server-side on push.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const dest = new URL("/dashboard/integrations", req.url);

  const fail = (e: string) => {
    dest.searchParams.set("error", e);
    const r = NextResponse.redirect(dest);
    r.cookies.delete("hubspot_oauth_state");
    return r;
  };

  if (url.searchParams.get("error")) return fail("cancelled");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get("hubspot_oauth_state")?.value;
  if (!code || !state || !cookieState || state !== cookieState) return fail("bad_state");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("unauthorized");
  if (await mfaMissing(await sessionToken(supabase), user.id)) return fail("unauthorized");

  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail("not_configured");

  const base = process.env.INTEGRATIONS_BASE_URL ?? url.origin;
  const redirectUri = `${base}/api/integrations/hubspot/callback`;

  let tok: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  try {
    const r = await fetch("https://api.hubapi.com/oauth/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });
    tok = await r.json();
  } catch {
    return fail("exchange_failed");
  }
  if (!tok?.access_token || !tok.refresh_token) return fail("exchange_failed");

  // Portal identity — hub_id drives the "View record" deep links
  // (app.hubspot.com/contacts/{hub_id}/record/...), hub_domain the label.
  let info: { hub_domain?: string; hub_id?: number; scopes?: string[] } = {};
  try {
    const r = await fetch(
      `https://api.hubapi.com/oauth/v1/access-tokens/${tok.access_token}`,
    );
    if (r.ok) info = await r.json();
  } catch {
    // Non-fatal — connection still works without the label.
  }

  // Attach to the user's org. RLS WITH CHECK backstops org ownership.
  const { data: ou } = await supabase
    .from("org_users")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (!ou?.org_id) return fail("no_org");

  const expiresAt = new Date(
    Date.now() + Math.max(60, (tok.expires_in ?? 1800) - 120) * 1000,
  ).toISOString();

  const { error } = await supabase.from("org_integrations").upsert(
    {
      org_id: ou.org_id,
      provider: "hubspot",
      status: "connected",
      account_label: info.hub_domain ?? null,
      channel: null,
      secret: JSON.stringify({
        access_token: tok.access_token,
        refresh_token: tok.refresh_token,
        expires_at: expiresAt,
      }),
      meta: {
        hub_id: info.hub_id ?? null,
        scopes: info.scopes ?? null,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id,provider" },
  );
  if (error) return fail("store_failed");

  dest.searchParams.set("connected", "hubspot");
  const res = NextResponse.redirect(dest);
  res.cookies.delete("hubspot_oauth_state");
  return res;
}
