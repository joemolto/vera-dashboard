import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { engineBase } from "@/lib/engineBase";
import { mfaMissing, sessionToken, MFA_REQUIRED_MESSAGE } from "@/lib/mfaGate";

export const runtime = "nodejs";

// On-demand dossier refresh — thin authenticated proxy to the engine's
// one-off monitor pass. org_id comes from the caller's session (never the
// request body), and the engine only refreshes accounts on THAT org's
// watchlist, so there's no cross-org surface. The pass is free for the org
// and debounced engine-side to one per account per hour.
const ENGINE_KEY = process.env.ENGINE_API_KEY ?? "";

export async function POST(req: NextRequest) {
  let userId: string | null = null;
  let orgId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (await mfaMissing(await sessionToken(supabase), user.id)) {
      return NextResponse.json({ error: MFA_REQUIRED_MESSAGE }, { status: 401 });
    }
    userId = user.id;
    const { data: orgRows } = await supabase
      .from("org_users")
      .select("org_id")
      .eq("user_id", userId)
      .limit(1);
    orgId = orgRows?.[0]?.org_id ?? null;
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!orgId) return NextResponse.json({ error: "no org" }, { status: 403 });

  let body: { domain?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const domain = (body.domain ?? "").trim().toLowerCase();
  if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });

  try {
    const r = await fetch(`${engineBase()}/api/v1/watchlist/refresh-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": ENGINE_KEY },
      body: JSON.stringify({ org_id: orgId, domain }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return NextResponse.json({ error: "refresh_failed" }, { status: 502 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "refresh_failed" }, { status: 502 });
  }
}
