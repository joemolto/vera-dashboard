/**
 * GET  /api/settings/deal-economics
 *   → { average_deal_size: number | null, currency: string | null }
 *
 * PUT  /api/settings/deal-economics
 *   body: { average_deal_size: number | null, currency: string }
 *
 * Reads/writes `icp_config.client_context.{average_deal_size, currency}`
 * for the caller's org. These drive the "Est. deal value" column on the
 * accounts table (average deal size × account fit) and its currency
 * symbol. Lets clients self-serve their deal economics from Settings.
 *
 * Auth: standard Supabase JWT, scoped to the user's org via org_users —
 * same pattern as the signal-categories route.
 */

import { createClient } from "@supabase/supabase-js";
import { defaultCurrency } from "@/lib/dashboard/revenue";
import { mfaMissing, MFA_REQUIRED_MESSAGE } from "@/lib/mfaGate";

export const runtime = "nodejs";

const CURRENCIES = ["USD", "GBP", "EUR", "CAD", "AUD"] as const;
type Currency = (typeof CURRENCIES)[number];

function getUserClient(authHeader: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  );
}

function getServiceClient() {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function resolveOrg(authHeader: string) {
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false as const, status: 401, error: "Missing Authorization" };
  }
  const userClient = getUserClient(authHeader);
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false as const, status: 401, error: "Invalid session" };
  }
  if (await mfaMissing(authHeader, userData.user.id)) {
    return { ok: false as const, status: 401, error: MFA_REQUIRED_MESSAGE };
  }
  const { data: orgRows } = await userClient
    .from("org_users")
    .select("org_id")
    .eq("user_id", userData.user.id)
    .limit(1);
  const orgId = orgRows?.[0]?.org_id;
  if (!orgId) return { ok: false as const, status: 403, error: "No org for this user" };
  return { ok: true as const, orgId };
}

export async function GET(req: Request) {
  const auth = await resolveOrg(req.headers.get("Authorization") ?? "");
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const service = getServiceClient();
  const { data, error } = await service
    .from("organisations")
    .select("icp_config")
    .eq("id", auth.orgId)
    .limit(1);
  if (error) return json({ error: error.message }, 500);
  const icp = (data?.[0]?.icp_config ?? {}) as Record<string, unknown>;
  const cc = (icp.client_context ?? {}) as Record<string, unknown>;
  const locations = Array.isArray(icp.target_locations)
    ? (icp.target_locations as unknown[]).filter(
        (s): s is string => typeof s === "string",
      )
    : [];
  const size = cc.average_deal_size;
  const currency = cc.currency;
  return json({
    average_deal_size: typeof size === "number" ? size : null,
    // Fall back to the geo default (same rule the home uses) so the card
    // never shows a currency that disagrees with the dashboard.
    currency: typeof currency === "string" ? currency : defaultCurrency(locations),
  });
}

export async function PUT(req: Request) {
  const auth = await resolveOrg(req.headers.get("Authorization") ?? "");
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let body: { average_deal_size?: unknown; currency?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // Validate deal size: a positive, sane number (null clears it).
  let size: number | null = null;
  if (body.average_deal_size !== null && body.average_deal_size !== undefined) {
    const n = Number(body.average_deal_size);
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) {
      return json({ error: "average_deal_size must be a positive number" }, 400);
    }
    size = Math.round(n);
  }

  // Validate currency against the supported set.
  const currency = String(body.currency ?? "").toUpperCase();
  if (!CURRENCIES.includes(currency as Currency)) {
    return json({ error: `currency must be one of ${CURRENCIES.join(", ")}` }, 400);
  }

  const service = getServiceClient();
  const { data: orgRow, error: readErr } = await service
    .from("organisations")
    .select("icp_config, client_context")
    .eq("id", auth.orgId)
    .limit(1);
  if (readErr) return json({ error: readErr.message }, 500);
  const icp = (orgRow?.[0]?.icp_config ?? {}) as Record<string, unknown>;
  const iccc = (icp.client_context ?? {}) as Record<string, unknown>;
  const topcc = (orgRow?.[0]?.client_context ?? {}) as Record<string, unknown>;
  // Write BOTH client_context stores: icp_config.client_context (what the
  // engine reads) AND the top-level client_context column (what the home
  // dashboard's deal baseline reads). They must stay in lockstep or a save
  // here never shows up on the dashboard.
  const updated = {
    ...icp,
    client_context: { ...iccc, average_deal_size: size, currency },
  };
  const { error: writeErr } = await service
    .from("organisations")
    .update({
      icp_config: updated,
      client_context: { ...topcc, average_deal_size: size, currency },
    })
    .eq("id", auth.orgId);
  if (writeErr) return json({ error: writeErr.message }, 500);

  return json({ ok: true, average_deal_size: size, currency });
}
