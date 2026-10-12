import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { engineBase } from "@/lib/engineBase";
import { mfaMissing, sessionToken, MFA_REQUIRED_MESSAGE } from "@/lib/mfaGate";

export const runtime = "nodejs";

// The AI lives in the engine (/api/v1/groups/interpret, Haiku). This route is a
// thin authenticated proxy: it gates to logged-in users, then forwards to the
// engine with the shared key. No model/prompt/Anthropic logic here.
const ENGINE_KEY = process.env.ENGINE_API_KEY ?? "";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (await mfaMissing(await sessionToken(supabase), user.id)) {
      return NextResponse.json({ error: MFA_REQUIRED_MESSAGE }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { name?: string; entity_type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  const entity_type = body.entity_type === "people" ? "people" : "account";
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  try {
    const r = await fetch(`${engineBase()}/api/v1/groups/interpret`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": ENGINE_KEY },
      body: JSON.stringify({ name, entity_type }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return NextResponse.json({ error: "interpret_failed" }, { status: 502 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "interpret_failed" }, { status: 502 });
  }
}
