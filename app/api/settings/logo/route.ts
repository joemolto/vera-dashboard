/**
 * POST   /api/settings/logo   (multipart: file) → { ok, logo_url }
 *   Uploads a custom workspace logo to the org-logos bucket and stores its
 *   public URL on icp_config.logo_url (overrides the logo.dev auto-logo).
 *
 * DELETE /api/settings/logo   → { ok }
 *   Clears icp_config.logo_url so the workspace reverts to the auto logo.
 *
 * Auth: Supabase JWT scoped to the user's org via org_users (same pattern as
 * the deal-economics route). Upload runs under the service client.
 */

import { createClient } from "@supabase/supabase-js";
import { mfaMissing, MFA_REQUIRED_MESSAGE } from "@/lib/mfaGate";

export const runtime = "nodejs";

const BUCKET = "org-logos";
const MAX_BYTES = 2_000_000;
const TYPE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

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

async function setLogoUrl(orgId: string, url: string | null) {
  const service = getServiceClient();
  const { data } = await service
    .from("organisations")
    .select("icp_config")
    .eq("id", orgId)
    .limit(1);
  const icp = (data?.[0]?.icp_config ?? {}) as Record<string, unknown>;
  const { error } = await service
    .from("organisations")
    .update({ icp_config: { ...icp, logo_url: url } })
    .eq("id", orgId);
  return error?.message ?? null;
}

export async function POST(req: Request) {
  const auth = await resolveOrg(req.headers.get("Authorization") ?? "");
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Expected multipart form data" }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "No file provided" }, 400);
  if (file.size > MAX_BYTES) return json({ error: "Logo must be under 2 MB" }, 400);
  const ext = TYPE_EXT[file.type];
  if (!ext) return json({ error: "Use a PNG, JPG, SVG or WEBP image" }, 400);

  const service = getServiceClient();
  const path = `${auth.orgId}/logo-${Date.now()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await service.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (upErr) return json({ error: upErr.message }, 500);

  const { data: pub } = service.storage.from(BUCKET).getPublicUrl(path);
  const url = pub.publicUrl;
  const writeErr = await setLogoUrl(auth.orgId, url);
  if (writeErr) return json({ error: writeErr }, 500);

  return json({ ok: true, logo_url: url });
}

export async function DELETE(req: Request) {
  const auth = await resolveOrg(req.headers.get("Authorization") ?? "");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const writeErr = await setLogoUrl(auth.orgId, null);
  if (writeErr) return json({ error: writeErr }, 500);
  return json({ ok: true });
}
