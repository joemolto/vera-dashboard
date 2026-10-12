/**
 * Apply a chat-agent-proposed mutation after the user slide-to-confirms.
 *
 * POST /api/chat/confirm
 *   body: { kind: "add_to_watchlist" | "icp_change", payload: {...} }
 *   returns: { ok, data?, error? }
 *
 * The chat agent NEVER applies mutations directly — it returns a
 * `ProposedMutation` (rendered as a slide-to-confirm card). The user's
 * gesture posts here to actually commit the change. This is the only
 * place credit-spending or data-modifying chat actions reach the DB.
 *
 * Auth: requires a valid Supabase session JWT, same as /api/chat.
 *
 * Rule: every real-money commit (credits) +
 * every destructive action requires explicit slide-to-confirm. This
 * endpoint trusts that the client gesture happened — we don't replay
 * the gesture server-side, but we do verify the user is authenticated
 * and the mutation matches a known shape before applying.
 */

import { createClient } from "@supabase/supabase-js";
import { applyIcpChange, coerceIcpValue } from "@/lib/chat/icpChange";
import { engineBase } from "@/lib/engineBase";
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

/** Remaining Solo allowances from the engine — the single source of truth
 *  for plan caps (base + capacity packs via effective_limits). Returns null
 *  on any failure; callers treat null as "could not check". Only called for
 *  orgs whose features.solo_plan is set. */
async function fetchSoloRemaining(
  orgId: string,
): Promise<{ accounts: number; watched: number } | null> {
  try {
    const base = engineBase();
    const res = await fetch(`${base}/api/v1/accounts/solo/limits`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.ENGINE_API_KEY ?? "",
      },
      body: JSON.stringify({ org_id: orgId }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      remaining?: { accounts?: number; watched?: number };
    };
    return {
      accounts: data.remaining?.accounts ?? 0,
      watched: data.remaining?.watched ?? 0,
    };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing Authorization" }, 401);
  }

  let body: { kind?: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const kind = body.kind;
  const payload = body.payload ?? {};
  if (!kind) return jsonResponse({ error: "kind is required" }, 400);

  // Resolve user + org from JWT
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

  if (kind === "add_to_watchlist") {
    const domain = String(payload.domain ?? "").toLowerCase().trim();
    if (!domain) return jsonResponse({ error: "domain required" }, 400);

    // Use service client for the watchlist insert so we can also write
    // last_used_at etc. without an RLS round-trip. Upsert-style: if the
    // domain is already on the watchlist, return that row instead of
    // erroring on the unique constraint.
    const service = getServiceClient();
    const { data: existing } = await service
      .from("watchlist")
      .select("id")
      .eq("org_id", orgId)
      .ilike("company_domain", domain)
      .limit(1);

    let watchlistId: string | null = existing?.[0]?.id ?? null;
    if (!watchlistId) {
      // Solo cap gate BEFORE the insert. This route writes with the service
      // client (bypasses RLS), so without this check the chat confirm card
      // was a side door around the plan: a new watched account consumes one
      // monthly research slot and one standing watch slot, and every watched
      // account costs a weekly monitor pass. Engine is the source of truth
      // (pack-aware). On engine flake we proceed (fail-open): quick-enrich
      // below still enforces the research allowance engine-side, so the
      // worst case is one over-cap watch slot for the flake window.
      const { data: orgRows2 } = await service
        .from("organisations")
        .select("icp_config")
        .eq("id", orgId)
        .limit(1);
      const features =
        (orgRows2?.[0]?.icp_config as { features?: Record<string, boolean> } | null)
          ?.features ?? {};
      if (features.solo_plan) {
        const remaining = await fetchSoloRemaining(orgId);
        if (remaining && remaining.accounts <= 0) {
          return jsonResponse(
            {
              error:
                "You've used this month's research allowance on your plan, so this account can't be added right now. Your allowance refreshes next month, or you can buy more capacity in Settings (Plan and usage).",
            },
            429,
          );
        }
        if (remaining && remaining.watched <= 0) {
          return jsonResponse(
            {
              error:
                "You're watching the maximum accounts on your plan. Stop watching one, or buy more capacity in Settings (Plan and usage).",
            },
            429,
          );
        }
      }

      const { data: inserted, error: insertErr } = await service
        .from("watchlist")
        .insert({
          org_id: orgId,
          company_name: domain,
          company_domain: domain,
          monitoring_active: true,
          priority: "medium",
        })
        .select("id")
        .limit(1);
      if (insertErr) {
        console.error("[chat/confirm] watchlist insert error:", insertErr.message);
        return jsonResponse(
          { error: "Couldn't add the account. Please try again." },
          500,
        );
      }
      watchlistId = inserted?.[0]?.id ?? null;
    }

    // Fire-and-await company enrichment via the existing quick-enrich
    // edge function (domain-mode — engine dispatches on payload shape
    // and runs PL + Apollo + Perplexity + tech stack, upserts companies,
    // ensures the watchlist row exists). The 1-credit charge is logged
    // engine-side as part of the enrichment job.
    let enrichmentOk = false;
    let enrichmentError: string | undefined;
    try {
      const enrichResp = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/quick-enrich`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // quick-enrich requires the caller's session and verifies
            // org membership edge-side (it spends real credits).
            Authorization: authHeader,
          },
          body: JSON.stringify({ domain, org_id: orgId }),
          signal: AbortSignal.timeout(180_000),
        },
      );
      enrichmentOk = enrichResp.ok;
      if (!enrichResp.ok) {
        // Log the raw edge-function error server-side; never echo it to the
        // client — it can carry org_id / operational detail.
        const raw = await enrichResp.text().catch(() => `HTTP ${enrichResp.status}`);
        console.error("[chat/confirm] quick-enrich error:", raw);
        enrichmentError = "Enrichment couldn't start. Please try again.";
      }
    } catch (e) {
      console.error("[chat/confirm] quick-enrich threw:", e);
      enrichmentError = "Enrichment couldn't start. Please try again.";
    }

    return jsonResponse({
      ok: true,
      kind,
      data: {
        watchlist_id: watchlistId,
        domain,
        enrichment_triggered: enrichmentOk,
        enrichment_error: enrichmentError,
      },
    });
  }

  if (kind === "icp_change") {
    const field = String(payload.field ?? "").trim();
    if (!field) return jsonResponse({ error: "field required" }, 400);

    // Re-coerce here too: cards proposed before values were normalised can
    // still carry a stringified array in their payload.
    const coerced = coerceIcpValue(field, payload.new_value);
    if (!coerced.ok) return jsonResponse({ error: coerced.error }, 400);

    // Persona fields go through the engine (persona + flat union); the
    // old flat-only merge here never reached key-contact discovery.
    try {
      await applyIcpChange(orgId, field, coerced.value, getServiceClient());
    } catch (e) {
      console.error("[chat/confirm] icp_change failed:", e);
      return jsonResponse({ error: "Couldn't update the ICP. Please try again." }, 500);
    }

    return jsonResponse({ ok: true, kind, data: { field, new_value: coerced.value } });
  }

  return jsonResponse({ error: `Unknown mutation kind: ${kind}` }, 400);
}
