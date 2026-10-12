/**
 * Unsubscribe for the free-report follow-up sequence.
 *
 *   GET  /api/unsubscribe?t=<token>  -> DISPLAY ONLY. Renders a confirmation
 *        button that POSTs. Does NOT mutate state. This matters: corporate mail
 *        security (Outlook Safe Links, Mimecast, Proofpoint, AV scanners) auto-
 *        fetch every link in an email via GET to scan it — if GET unsubscribed,
 *        those scanners would silently opt people out who never clicked.
 *   POST /api/unsubscribe?t=<token>  -> flips free_report_leads.unsubscribed=true
 *        (matched by per-lead UUID token). Hit two ways: the RFC 8058 one-click
 *        header (mail client POSTs List-Unsubscribe=One-Click) and the confirm
 *        button below. Both flip the flag; the one-click client ignores the body.
 *
 * The follow-up drip query filters on `unsubscribed = false`, so a flip stops the
 * sequence on the next run.
 */
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function serviceClient() {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

async function unsubscribe(token: string | null): Promise<boolean> {
  if (!token || !TOKEN_RE.test(token)) return false;
  try {
    const sb = serviceClient();
    const { data } = await sb
      .from("free_report_leads")
      .update({ unsubscribed: true, updated_at: new Date().toISOString() })
      .eq("unsub_token", token)
      .select("email")
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

// Daily-digest opt-out. The digest email carries an unguessable per-org
// token (icp_config.solo_digest.unsub_token, set by the engine), so there
// is no IDOR — we match the org by token, never by a raw org_id, and flip
// icp_config.solo_digest.opted_out. Merge-read-write to preserve the rest
// of icp_config (features, personas, wizard answers).
async function unsubscribeDigest(token: string | null): Promise<boolean> {
  if (!token || !TOKEN_RE.test(token)) return false;
  try {
    const sb = serviceClient();
    const { data: org } = await sb
      .from("organisations")
      .select("id, icp_config")
      .filter("icp_config->solo_digest->>unsub_token", "eq", token)
      .maybeSingle();
    if (!org) return false;
    const icp = (org.icp_config ?? {}) as Record<string, unknown>;
    const sd = (icp.solo_digest ?? {}) as Record<string, unknown>;
    icp.solo_digest = { ...sd, opted_out: true };
    await sb.from("organisations").update({ icp_config: icp }).eq("id", org.id);
    return true;
  } catch {
    return false;
  }
}

function isDigest(url: URL): boolean {
  return url.searchParams.get("kind") === "solo_digest";
}

function shell(inner: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Vera</title></head>
<body style="margin:0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;background:#0a0a0a;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center">
<div style="text-align:center;max-width:420px;padding:24px">${inner}
<div style="margin-top:14px;color:#9aa39d;font-size:13px">Vera</div>
</div></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

const HEADING = (msg: string) =>
  `<div style="font-size:18px;font-weight:600;letter-spacing:-0.01em">${msg}</div>`;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const t = url.searchParams.get("t");
  if (!t || !TOKEN_RE.test(t)) {
    return shell(HEADING("That link has expired or is invalid."));
  }
  const digest = isDigest(url);
  const action = `/api/unsubscribe?t=${encodeURIComponent(t)}${digest ? "&kind=solo_digest" : ""}`;
  return shell(
    `${HEADING(digest ? "Unsubscribe from your daily Vera digest?" : "Unsubscribe from Vera follow-ups?")}
<form method="post" action="${action}" style="margin-top:20px">
<button type="submit" style="appearance:none;border:0;cursor:pointer;background:#fff;color:#0a0a0a;font-size:14px;font-weight:600;padding:11px 22px;border-radius:8px">Confirm unsubscribe</button>
</form>`,
  );
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const t = url.searchParams.get("t");
  const ok = isDigest(url) ? await unsubscribeDigest(t) : await unsubscribe(t);
  return shell(
    HEADING(
      ok
        ? "You're unsubscribed — no more emails."
        : "That link has expired or is invalid.",
    ),
  );
}
