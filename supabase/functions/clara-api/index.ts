import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// clara-api — the tenant-isolation boundary between the dashboard and the
// engine. The engine runs as service-role (RLS bypassed), so this proxy's
// session + org-membership check is the ONLY gate on cross-tenant access.
//
// v5 (2026-06-10): requires a valid Supabase session; resolves the caller's
//   org membership from org_users; rejects requests referencing an org the
//   caller doesn't belong to.
// v6: engine key from the ENGINE_API_KEY secret.
// v7: engine URL from the ENGINE_API_BASE secret.
// v8 (2026-06-12): /billing/complete-signup added to PUBLIC_PATHS.
// v12 (2026-06-15): org enforcement validates ANY organisation UUID in a
//   path segment, not just known routes.
// v14 (2026-07-15, security audit): three fixes —
//   (#1) AAL/MFA enforcement: the dashboard gates MFA only at page load, so
//        an AAL1 (password-only) token sent straight here reached the data
//        plane. Now: an enrolled user, or a member of an mfa_required org,
//        must present an AAL2 token. Fails closed: if the check can't
//        complete, the request is refused (try again).
//   (#5) start-signup rate limit (since removed: the self-hosted edition
//        blocks the Stripe signup paths outright, see BLOCKED_PATHS).
//   (#6) /leads/free-report is a marketing-site-only engine route (that
//        site calls the engine directly with the shared key). It must
//        NOT be reachable through the authenticated proxy, where its
//        Turnstile + cost caps don't apply. Blocked outright.
//
// SOURCE OF TRUTH: this file. Deploy with
//   supabase functions deploy clara-api --no-verify-jwt
// (or the Supabase MCP deploy). It was previously deployed-only, with no
// copy in version control — do not let it drift back to that.

const API_KEY = Deno.env.get("ENGINE_API_KEY") ?? "";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Paths callable without a session.
// Self-hosted: no session-less routes. Logins and orgs are created with the
// engine's scripts/create_org.py, not through Stripe signup.
const PUBLIC_PATHS = new Set<string>();

// Engine routes that must NEVER be reachable through the authenticated
// proxy. /leads/free-report is meant ONLY for a separate marketing site
// (called directly, with the shared engine key + its own Turnstile/caps);
// exposing it here lets any session spend enrichment budget + send mail
// from the deployment's domain to arbitrary recipients uncapped.
const BLOCKED_PATHS = new Set([
  "/leads/free-report",
  // Hosted Stripe signup; meaningless self-hosted (it would create orgs).
  "/billing/start-signup",
  "/billing/complete-signup",
  "/billing/topup-packs",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ENRICHMENT_PATH_RE =
  /\/(enrichment|quick-enrich|enrich|scoring\/score|brain)/;
const DEFAULT_TIMEOUT_MS = 60000;
const ENRICHMENT_TIMEOUT_MS = 240000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

function deny(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: CORS_HEADERS,
  });
}

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, x-client-info, apikey",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  try {
    const url = new URL(req.url);
    let path = url.pathname;
    const prefixes = ["/functions/v1/clara-api", "/clara-api"];
    for (const prefix of prefixes) {
      if (path.startsWith(prefix)) {
        path = path.slice(prefix.length);
        break;
      }
    }
    if (!path.startsWith("/")) path = "/" + path;

    // Canonicalise before matching, and forward that same form: the engine
    // decodes %-escapes and redirects doubled or trailing slashes to the
    // real route, so matching the raw path let blocked routes through.
    let segments: string[];
    try {
      segments = path.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
    } catch {
      return deny(400, "Bad path.");
    }
    if (segments.some((s) => s === "." || s === ".." || /[\/\\?#%]/.test(s))) {
      return deny(400, "Bad path.");
    }
    path = "/" + segments.join("/");
    const forwardPath = "/" + segments.map(encodeURIComponent).join("/");

    // (#6) Hard block — never proxy the marketing-only free-report route.
    // 404 rather than 403 so its existence isn't confirmed.
    if (BLOCKED_PATHS.has(path)) {
      return deny(404, "Not found.");
    }

    const isPublic = PUBLIC_PATHS.has(path);

    // ------------------------------------------------------------------
    // Auth: validate the caller's Supabase session and resolve orgs.
    // ------------------------------------------------------------------
    let memberOrgIds: Set<string> | null = null;
    if (!isPublic) {
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
      const { data: orgRows, error: orgErr } = await admin
        .from("org_users")
        .select("org_id")
        .eq("user_id", userData.user.id);
      if (orgErr) {
        console.error(`org_users lookup failed: ${orgErr.message}`);
        return deny(500, "Could not resolve organisation membership.");
      }
      memberOrgIds = new Set((orgRows ?? []).map((r) => r.org_id as string));
      if (memberOrgIds.size === 0) {
        return deny(403, "Your account isn't linked to an organisation.");
      }

      // (#1) AAL / MFA enforcement. getUser validates the JWT but is
      // AAL-blind, so a password-only AAL1 token would otherwise reach the
      // data plane. Require AAL2 for enrolled users and for members of an
      // mfa_required org, mirroring the dashboard gates. Fails closed.
      try {
        const aal = decodeAalClaim(token);
        if (aal !== "aal2") {
          let needsMfa = false;
          // Org policy first (one indexed query; definitive for every
          // self-serve signup, which provisions mfa_required=true).
          const { data: orgCfg } = await admin
            .from("organisations")
            .select("icp_config")
            .in("id", [...memberOrgIds]);
          if (
            (orgCfg ?? []).some(
              (o: { icp_config?: { mfa_required?: boolean } }) =>
                o?.icp_config?.mfa_required === true,
            )
          ) {
            needsMfa = true;
          }
          // Otherwise, a user who voluntarily enrolled a factor must still
          // present AAL2 (matches the dashboard's Gate 1). Only reached for
          // non-required orgs, so most legacy requests skip this call.
          if (!needsMfa) {
            const { data: factorData } = await admin.auth.admin.mfa.listFactors({
              userId: userData.user.id,
            });
            const factors = (factorData?.factors ?? []) as Array<{ status?: string }>;
            if (factors.some((f) => f.status === "verified")) needsMfa = true;
          }
          if (needsMfa) {
            return deny(
              401,
              "Multi-factor authentication required — complete the challenge in the dashboard.",
            );
          }
        }
      } catch (e) {
        console.error(`MFA check error (refusing): ${e}`);
        return deny(503, "Couldn't verify two-factor status. Try again.");
      }
    }

    let body: string | undefined;
    if (req.method === "POST" || req.method === "PUT") {
      body = await req.text();
    }

    // ------------------------------------------------------------------
    // Org enforcement: every org reference in the request must belong to
    // the caller — body org_id, ?org_id=, and ANY org UUID in the path.
    // ------------------------------------------------------------------
    if (!isPublic && memberOrgIds) {
      const claimed: string[] = [];
      if (body) {
        try {
          const parsed = JSON.parse(body);
          if (parsed && typeof parsed.org_id === "string") {
            claimed.push(parsed.org_id);
          }
        } catch {
          // non-JSON body — nothing to extract
        }
      }
      const queryOrg = url.searchParams.get("org_id");
      if (queryOrg) claimed.push(queryOrg);

      const segs = path.split("/").filter(Boolean);
      const unknownPathUuids = segs.filter(
        (s) => UUID_RE.test(s) && !memberOrgIds!.has(s),
      );
      if (unknownPathUuids.length > 0) {
        const { data: foreignOrgs, error: orgLookupErr } = await admin
          .from("organisations")
          .select("id")
          .in("id", unknownPathUuids);
        if (orgLookupErr) {
          console.error(`org path lookup failed: ${orgLookupErr.message}`);
          return deny(500, "Could not verify organisation access.");
        }
        if ((foreignOrgs ?? []).length > 0) {
          return deny(403, "You don't have access to this organisation.");
        }
      }

      for (const org of claimed) {
        if (!memberOrgIds.has(org)) {
          return deny(403, "You don't have access to this organisation.");
        }
      }
    }

    // Engine URL without /api/v1 (same value as the dashboard's), read per
    // request so the function still deploys without it.
    const engineBase = Deno.env.get("ENGINE_API_BASE")?.replace(/\/+$/, "");
    if (!engineBase) return deny(500, "ENGINE_API_BASE is not set.");

    const queryString = url.search;
    const targetUrl = `${engineBase}/api/v1${forwardPath}${queryString}`;
    const timeoutMs = ENRICHMENT_PATH_RE.test(path)
      ? ENRICHMENT_TIMEOUT_MS
      : DEFAULT_TIMEOUT_MS;

    console.log(`Proxying ${req.method} ${path} -> ${targetUrl} (timeout=${timeoutMs}ms)`);

    const headers: Record<string, string> = {
      "X-API-Key": API_KEY,
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const responseText = await response.text();
    console.log(`Response ${response.status}: ${responseText.substring(0, 200)}`);

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
      ? "Request timed out — enrichment took longer than 4 minutes"
      : (error as { message?: string }).message || "Couldn't reach the Vera engine";
    console.error(`Proxy error: ${message}`);
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: CORS_HEADERS,
    });
  }
});
