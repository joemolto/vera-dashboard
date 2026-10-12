import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mfaMissing, sessionToken, MFA_REQUIRED_MESSAGE } from "@/lib/mfaGate";

export const runtime = "nodejs";

// Slack redirects here after the user authorises. We validate the CSRF state,
// exchange the code for the incoming-webhook URL, and store it against the
// user's org. The webhook URL is a secret: it goes in `secret` (never selected
// by the browser) and the insert is RLS-checked to the user's own org.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const dest = new URL("/dashboard/integrations", req.url);

  const fail = (e: string) => {
    dest.searchParams.set("error", e);
    const r = NextResponse.redirect(dest);
    r.cookies.delete("slack_oauth_state");
    return r;
  };

  if (url.searchParams.get("error")) return fail("cancelled");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get("slack_oauth_state")?.value;
  if (!code || !state || !cookieState || state !== cookieState) return fail("bad_state");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("unauthorized");
  if (await mfaMissing(await sessionToken(supabase), user.id)) return fail("unauthorized");

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail("not_configured");

  const base = process.env.INTEGRATIONS_BASE_URL ?? url.origin;
  const redirectUri = `${base}/api/integrations/slack/callback`;

  let tok: {
    ok?: boolean;
    scope?: string;
    access_token?: string; // xoxb bot token (bot scopes requested)
    team?: { name?: string; id?: string };
    incoming_webhook?: {
      url?: string;
      channel?: string;
      channel_id?: string;
      configuration_url?: string;
    };
  };
  try {
    const r = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
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
  if (!tok?.ok || !tok.incoming_webhook?.url) return fail("exchange_failed");

  // Attach to the user's org. RLS WITH CHECK backstops org ownership.
  const { data: ou } = await supabase
    .from("org_users")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (!ou?.org_id) return fail("no_org");

  const { error } = await supabase.from("org_integrations").upsert(
    {
      org_id: ou.org_id,
      provider: "slack",
      status: "connected",
      account_label: tok.team?.name ?? null,
      channel: tok.incoming_webhook.channel ?? null,
      // JSON secret (bot era): webhook for cards/brief + bot token for
      // the @Vera agent's replies. The engine's parse_secret handles
      // both this shape and legacy plain-string webhooks.
      secret: JSON.stringify({
        webhook_url: tok.incoming_webhook.url,
        bot_token: tok.access_token ?? null,
      }),
      meta: {
        channel_id: tok.incoming_webhook.channel_id ?? null,
        configuration_url: tok.incoming_webhook.configuration_url ?? null,
        scope: tok.scope ?? null,
        // Events arrive keyed by workspace — this is the org mapping.
        team_id: tok.team?.id ?? null,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id,provider" },
  );
  if (error) return fail("store_failed");

  dest.searchParams.set("connected", "slack");
  const res = NextResponse.redirect(dest);
  res.cookies.delete("slack_oauth_state");
  return res;
}
