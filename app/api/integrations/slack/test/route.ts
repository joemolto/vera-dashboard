import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mfaMissing, sessionToken, MFA_REQUIRED_MESSAGE } from "@/lib/mfaGate";

export const runtime = "nodejs";

// Send a test message to the org's connected Slack channel. RLS scopes the
// lookup to the caller's org; the webhook URL (secret) is used server-side and
// never returned to the browser.
export async function POST(_req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (await mfaMissing(await sessionToken(supabase), user.id)) {
    return NextResponse.json({ error: MFA_REQUIRED_MESSAGE }, { status: 401 });
  }

  const { data: rows, error } = await supabase
    .from("org_integrations")
    .select("secret")
    .eq("provider", "slack")
    .limit(1);
  if (error || !rows?.length || !rows[0].secret) {
    return NextResponse.json({ error: "not_connected" }, { status: 400 });
  }

  try {
    const r = await fetch(rows[0].secret as string, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: ":wave: *Vera is connected.* Hot-account and signal alerts will land in this channel.",
      }),
    });
    if (!r.ok) return NextResponse.json({ error: "slack_rejected" }, { status: 502 });
  } catch {
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
