import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { emitCapHit, parseCapError } from "@/lib/dashboard/upgradeSignal";
import { SELF_HOSTED } from "@/lib/selfHosted";

const CLARA_API_BASE =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/clara-api`;
const DEFAULT_TIMEOUT_MS = 120_000;
// Engine's full enrichment pipeline has a 180s budget; quick-enrich +
// scoring + briefing on top can push past 200s on slow domains.
// 240s gives the dashboard a hard ceiling above the engine's so users
// see the result instead of a client-side abort while the engine is
// still working.
const ENRICHMENT_TIMEOUT_MS = 240_000;

const ENRICHMENT_PATH_RE = /\/(enrichment|quick-enrich|enrich|scoring\/score)/;

export async function claraApi<T = unknown>(
  path: string,
  options: RequestInit = {},
  timeoutMs?: number,
): Promise<T> {
  const effectiveTimeout =
    timeoutMs ??
    (ENRICHMENT_PATH_RE.test(path) ? ENRICHMENT_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

  // The clara-api edge function requires the caller's Supabase session
  // token and enforces org membership server-side. Public paths (e.g.
  // /billing/start-signup from the pricing page) are allowlisted in the
  // edge function, so a missing session just omits the header.
  const {
    data: { session },
  } = await createSupabaseBrowserClient().auth.getSession();
  const authHeaders: Record<string, string> = session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};

  try {
    const res = await fetch(`${CLARA_API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...options.headers,
      },
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const body = await res.text();
      // A 429 means a plan cap was hit (or the org is lapsed, caps zeroed).
      // Fire the global signal so the shared upgrade/reactivate modal opens.
      // Self-hosted has no plan caps, so a 429 there is a rate limit.
      if (!SELF_HOSTED && res.status === 429) {
        const hit = parseCapError(res.status, body);
        if (hit) emitCapHit(hit);
      }
      const err = new Error(
        body || `Request failed (${res.status})`,
      ) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}
