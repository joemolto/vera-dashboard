/**
 * DELETE /api/mcp/keys/:id — soft-revoke an MCP API key (sets
 * `revoked_at`). Revoked keys stop authenticating on /api/mcp.
 *
 * Hard-delete is deliberately not exposed — keeping the audit trail
 * (when issued, when revoked, last_used_at) is more useful than a
 * clean table.
 */

import { createClient } from "@supabase/supabase-js";
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

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return jsonResponse({ error: "id required" }, 400);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing Authorization" }, 401);
  }

  // Resolve user → org so we can verify the key belongs to them before
  // revoking (the service client bypasses RLS).
  const userClient = getUserClient(authHeader);
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse({ error: "Invalid session" }, 401);
  }
  const userId = userData.user.id;
  if (await mfaMissing(authHeader, userId)) {
    return jsonResponse({ error: MFA_REQUIRED_MESSAGE }, 401);
  }
  const { data: orgRows } = await userClient
    .from("org_users")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1);
  const orgId = orgRows?.[0]?.org_id;
  if (!orgId) return jsonResponse({ error: "No org for this user" }, 403);

  const service = getServiceClient();
  // Org-scoped update — anyone trying to revoke another org's key gets a
  // no-op (0 rows updated). Plus the RLS policy on mcp_api_keys would
  // block it too via the user client, but we use service here for
  // last_used_at writes elsewhere — consistency matters.
  const { data, error } = await service
    .from("mcp_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("id");
  if (error) return jsonResponse({ error: error.message }, 500);
  if (!data?.length) {
    return jsonResponse({ error: "Key not found in your org" }, 404);
  }

  return jsonResponse({ ok: true, id });
}
