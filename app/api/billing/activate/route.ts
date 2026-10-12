import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { engineBase } from "@/lib/engineBase";
import { mfaMissing, sessionToken, MFA_REQUIRED_MESSAGE } from "@/lib/mfaGate";

export const runtime = "nodejs";

// Payment-required gate → Stripe Checkout. Thin authenticated proxy to the
// engine's activation checkout (existing org, no trial, first invoice bills
// immediately). org_id and email come from the caller's session, never the
// request body. Only orgs actually sitting behind the gate can create a
// session — anyone else gets a 409 and the UI never shows them the gate.
const ENGINE_KEY = process.env.ENGINE_API_KEY ?? "";

export async function POST(req: Request) {
  let orgId: string | null = null;
  let email = "";
  let status = "";
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (await mfaMissing(await sessionToken(supabase), user.id)) {
      return NextResponse.json({ error: MFA_REQUIRED_MESSAGE }, { status: 401 });
    }
    email = user.email ?? "";
    const { data: orgRows } = await supabase
      .from("org_users")
      .select("org_id, organisations:org_id (subscription_status)")
      .eq("user_id", user.id)
      .limit(1);
    orgId = orgRows?.[0]?.org_id ?? null;
    const orgRow = orgRows?.[0]?.organisations as { subscription_status?: string | null } | null;
    status = String(orgRow?.subscription_status ?? "").toLowerCase();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!orgId || !email) return NextResponse.json({ error: "no org" }, { status: 403 });
  if (status !== "payment_required") {
    return NextResponse.json({ error: "not gated" }, { status: 409 });
  }

  const origin = new URL(req.url).origin;
  try {
    const r = await fetch(`${engineBase()}/api/v1/billing/create-activation-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": ENGINE_KEY },
      body: JSON.stringify({
        org_id: orgId,
        email,
        tier: "solo",
        success_url: `${origin}/dashboard?payment=success`,
        cancel_url: `${origin}/dashboard`,
      }),
    });
    const data = (await r.json().catch(() => ({}))) as { url?: string };
    if (!r.ok || !data.url) {
      return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
    }
    return NextResponse.json({ url: data.url });
  } catch {
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}
