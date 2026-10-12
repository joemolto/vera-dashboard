import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Researches one account for the signed-in user. Requires a valid Supabase
// session, membership of the body's org_id and, where required, the
// two-factor code; then forwards to the engine with ENGINE_API_KEY.

const API_KEY = Deno.env.get("ENGINE_API_KEY") ?? "";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

// Decode the `aal` claim from a Supabase access token (JWT). Returns null
// if it can't be read; callers treat anything but "aal2" as unverified.
function decodeAalClaim(token: string): string | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const pad = (4 - (part.length % 4)) % 4;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
    const payload = JSON.parse(atob(b64));
    return typeof payload.aal === "string" ? payload.aal : null;
  } catch {
    return null;
  }
}

function deny(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: CORS_HEADERS,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, x-client-info, apikey",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  try {
    // ------------------------------------------------------------------
    // Auth: valid session + caller must belong to the body's org_id.
    // ------------------------------------------------------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";
    if (!token) {
      return deny(401, "Session required — refresh the dashboard and sign in.");
    }
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return deny(401, "Session expired — refresh the dashboard and sign in.");
    }

    const body = await req.json();
    const orgId = typeof body?.org_id === "string" ? body.org_id : "";
    if (!orgId) return deny(400, "org_id is required");

    const { data: orgRows, error: orgErr } = await admin
      .from("org_users")
      .select("org_id")
      .eq("user_id", userData.user.id)
      .eq("org_id", orgId)
      .limit(1);
    if (orgErr) {
      console.error(`org_users lookup failed: ${orgErr.message}`);
      return deny(500, "Could not resolve organisation membership.");
    }
    if (!orgRows || orgRows.length === 0) {
      return deny(403, "You don't have access to this organisation.");
    }

    // Two-factor, same rule as clara-api: a member of an mfa_required org,
    // or a user with a verified factor, must present an aal2 token. Without
    // this a password alone could spend research credits. Fails closed.
    try {
      const aal = decodeAalClaim(token);
      if (aal !== "aal2") {
        const { data: orgCfg } = await admin
          .from("organisations")
          .select("icp_config")
          .eq("id", orgId)
          .maybeSingle();
        let needsMfa = orgCfg?.icp_config?.mfa_required === true;
        if (!needsMfa) {
          const { data: factorData } = await admin.auth.admin.mfa.listFactors({
            userId: userData.user.id,
          });
          const factors = (factorData?.factors ?? []) as Array<{ status?: string }>;
          needsMfa = factors.some((f) => f.status === "verified");
        }
        if (needsMfa) {
          return deny(401, "Multi-factor authentication required — complete the challenge in the dashboard.");
        }
      }
    } catch (e) {
      console.error(`MFA check error (refusing): ${e}`);
      return deny(503, "Couldn't verify two-factor status. Try again.");
    }

    // Engine URL without /api/v1 (same value as the dashboard's), read per
    // request so the function still deploys without it.
    const engineBase = Deno.env.get("ENGINE_API_BASE")?.replace(/\/+$/, "");
    if (!engineBase) return deny(500, "ENGINE_API_BASE is not set.");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const response = await fetch(`${engineBase}/api/v1/leads/quick-enrich`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const responseText = await response.text();

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return new Response(
        JSON.stringify({
          error: "API returned non-JSON response",
          detail: responseText.substring(0, 200),
        }),
        { status: 502, headers: CORS_HEADERS },
      );
    }

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: CORS_HEADERS,
    });
  } catch (error) {
    const message = (error as { name?: string }).name === "AbortError"
      ? "Request timed out — enrichment is taking longer than 2 minutes"
      : (error as { message?: string }).message || "Couldn't reach the Vera engine";
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: CORS_HEADERS,
    });
  }
});
