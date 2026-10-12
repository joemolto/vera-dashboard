/**
 * MCP key management for the dashboard Settings page.
 *
 *   GET    /api/mcp/keys           — list this org's keys (hashed; no plaintext)
 *   POST   /api/mcp/keys           — generate a new key; returns plaintext ONCE
 *   DELETE /api/mcp/keys/:id       — revoke a key
 *
 * Auth: standard Supabase JWT, scope to user's org via org_users.
 *
 * Same crypto + table as scripts/mcp_issue_key.ts. The admin script
 * stays as a fallback for ops; this is the self-serve path customers
 * use to issue tokens for their own Claude/Slack/n8n agents.
 */

import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function resolveOrgId(authHeader: string): Promise<
  | { ok: true; orgId: string; userId: string }
  | { ok: false; status: number; error: string }
> {
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Missing Authorization" };
  }
  const userClient = getUserClient(authHeader);
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false, status: 401, error: "Invalid session" };
  }
  const userId = userData.user.id;
  if (await mfaMissing(authHeader, userId)) {
    return { ok: false, status: 401, error: MFA_REQUIRED_MESSAGE };
  }
  const { data: orgRows } = await userClient
    .from("org_users")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1);
  const orgId = orgRows?.[0]?.org_id;
  if (!orgId) return { ok: false, status: 403, error: "No org for this user" };
  return { ok: true, orgId, userId };
}

// ---------------------------------------------------------------------------
// GET — list keys (no plaintext, ever)
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const auth = await resolveOrgId(req.headers.get("Authorization") ?? "");
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

  const service = getServiceClient();
  const { data, error } = await service
    .from("mcp_api_keys")
    .select("id, name, key_prefix, created_at, last_used_at, revoked_at")
    .eq("org_id", auth.orgId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[mcp/keys GET] db error:", error.message);
    return jsonResponse({ error: "Couldn't load keys. Please try again." }, 500);
  }

  return jsonResponse({ keys: data ?? [] });
}

// ---------------------------------------------------------------------------
// POST — create a new key. Returns plaintext token ONCE.
// ---------------------------------------------------------------------------

// MCP ships on every paid plan (usage is bounded by the plan caps,
// enforced at every cost-incurring endpoint). Mirror the
// engine's TIERS_WITH_API_ACCESS so the gate holds even if the settings
// UI is bypassed.
const TIERS_WITH_API_ACCESS = new Set(["starter", "solo", "scout", "growth", "scale"]);

export async function POST(req: Request) {
  const auth = await resolveOrgId(req.headers.get("Authorization") ?? "");
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

  const svc = getServiceClient();
  const { data: org } = await svc
    .from("organisations")
    .select("tier, subscription_tier, icp_config")
    .eq("id", auth.orgId)
    .limit(1)
    .single();
  const tier = (org?.subscription_tier ?? org?.tier ?? "").toLowerCase();
  // `developer_access` (icp_config.features) grants MCP access even on a
  // tier that normally lacks it (e.g. a Solo trial).
  const devAccess = !!(org?.icp_config as { features?: Record<string, unknown> } | null)
    ?.features?.developer_access;
  if (!TIERS_WITH_API_ACCESS.has(tier) && !devAccess) {
    return jsonResponse(
      { error: "MCP access isn't available on your plan." },
      403,
    );
  }

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const name = (body.name ?? "").trim();
  if (!name) return jsonResponse({ error: "name is required" }, 400);
  if (name.length > 120) return jsonResponse({ error: "name too long" }, 400);

  // Same format as scripts/mcp_issue_key.ts: vera_ + 32 random bytes hex.
  // SHA-256 hash is what's persisted; the plaintext is shown to the user
  // ONCE in the response and then forgotten.
  const rawToken = `vera_${randomBytes(32).toString("hex")}`;
  const keyHash = createHash("sha256").update(rawToken).digest("hex");
  const keyPrefix = rawToken.slice(0, 12);

  const { data, error } = await svc
    .from("mcp_api_keys")
    .insert({
      org_id: auth.orgId,
      name,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      created_by: auth.userId,
    })
    .select("id, name, key_prefix, created_at")
    .limit(1);
  if (error) {
    console.error("[mcp/keys POST] insert error:", error.message);
    return jsonResponse({ error: "Couldn't create the key. Please try again." }, 500);
  }

  return jsonResponse({
    key: {
      ...data?.[0],
      full_key: rawToken, // returned ONCE
    },
  });
}
