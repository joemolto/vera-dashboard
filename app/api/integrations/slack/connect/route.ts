import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mfaMissing, sessionToken, MFA_REQUIRED_MESSAGE } from "@/lib/mfaGate";

export const runtime = "nodejs";

// Kick off the Slack OAuth flow. Requires a logged-in user. We ask only for the
// `incoming-webhook` scope: Slack returns a webhook URL bound to a channel the
// user picks, which we POST alerts to. A random `state` (also set as an httpOnly
// cookie) guards against CSRF on the callback.
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/dashboard", req.url));
  if (await mfaMissing(await sessionToken(supabase), user.id)) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      new URL("/dashboard/integrations?error=not_configured", req.url),
    );
  }

  const base = process.env.INTEGRATIONS_BASE_URL ?? new URL(req.url).origin;
  const redirectUri = `${base}/api/integrations/slack/callback`;
  const state = crypto.randomUUID();

  const authUrl = new URL("https://slack.com/oauth/v2/authorize");
  authUrl.searchParams.set("client_id", clientId);
  // incoming-webhook: channel cards + daily brief. The rest power the
  // @Vera conversational bot: hear mentions + DMs, reply anywhere.
  authUrl.searchParams.set(
    "scope",
    "incoming-webhook,chat:write,app_mentions:read,im:history",
  );
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(authUrl.toString());
  res.cookies.set("slack_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
