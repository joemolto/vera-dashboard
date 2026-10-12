/**
 * GET  /api/settings/signal-categories
 *   → { visible_categories: SignalCategory[] | null }
 *
 * PUT  /api/settings/signal-categories
 *   body: { visible_categories: SignalCategory[] }
 *
 * Reads/writes `icp_config.features.visible_signal_categories` for the
 * caller's org. `null` (or missing) means "show all" — same as picking
 * every category. The accounts dashboard's Signals column reads this
 * preference and renders only chips from the enabled categories.
 *
 * Auth: standard Supabase JWT, scoped to the user's org via org_users.
 */

import { createClient } from "@supabase/supabase-js";

import { ALL_CATEGORY_KEYS, type SignalCategory } from "@/lib/dashboard/signalCategories";
import { mfaMissing, MFA_REQUIRED_MESSAGE } from "@/lib/mfaGate";

export const runtime = "nodejs";

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
  const features = (icp.features ?? {}) as Record<string, unknown>;
  const visible = features.visible_signal_categories;
  return json({
    visible_categories: Array.isArray(visible) ? visible : null,
  });
}

export async function PUT(req: Request) {
  const auth = await resolveOrg(req.headers.get("Authorization") ?? "");
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let body: { visible_categories?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const raw = body.visible_categories;
  if (!Array.isArray(raw)) {
    return json({ error: "visible_categories must be an array" }, 400);
  }
  // Whitelist: drop anything that isn't a known category, dedupe.
  const validSet = new Set<string>(ALL_CATEGORY_KEYS);
  const cleaned: SignalCategory[] = Array.from(
    new Set(
      raw
        .map((v) => String(v))
        .filter((v) => validSet.has(v)),
    ),
  ) as SignalCategory[];

  const service = getServiceClient();
  // Shallow-merge: read current icp_config + features, overwrite just
  // the one field, write back. Avoids clobbering other features flags.
  const { data: orgRow, error: readErr } = await service
    .from("organisations")
    .select("icp_config")
    .eq("id", auth.orgId)
    .limit(1);
  if (readErr) return json({ error: readErr.message }, 500);
  const icp = (orgRow?.[0]?.icp_config ?? {}) as Record<string, unknown>;
  const features = (icp.features ?? {}) as Record<string, unknown>;
  const updated = {
    ...icp,
    features: {
      ...features,
      visible_signal_categories: cleaned,
    },
  };
  const { error: writeErr } = await service
    .from("organisations")
    .update({ icp_config: updated })
    .eq("id", auth.orgId);
  if (writeErr) return json({ error: writeErr.message }, 500);

  return json({ ok: true, visible_categories: cleaned });
}
