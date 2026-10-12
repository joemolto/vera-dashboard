// Apollo people-search by company domain. Used by the Vera accounts dashboard
// (/dashboard/accounts/[domain]) to surface the buying committee, and by
// the per-person 'Find connected' button to surface other senior leaders.
//
// Body params:
//   domain:           required
//   titles?:          string[]   — person_titles filter (ICP)
//   seniorities?:     string[]   — person_seniorities filter (e.g. ['c_suite','vp','director','head'])
//   exclude_apollo_id?: string   — drop this person from the response (current contact)
//   limit?:           number     — 1..100, default 25
//
// Auth: verify_jwt: true. JWT → RLS-scoped Supabase client → access gate
// (leads OR watchlist at this domain in this org). Also merges any
// already-unlocked rows from apollo_people_cache for this org.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const APOLLO_ENDPOINT = 'https://api.apollo.io/api/v1/mixed_people/api_search';
const ENGINE_KEY = Deno.env.get('ENGINE_API_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// Apollo's person_titles is a FUZZY match — it returns tangential roles (a
// "Social Media Manager" leaks into a security ICP because Apollo tokenises
// loosely). We gate the results with a REAL, word-boundary title check so only
// genuinely ICP-relevant people surface. Word boundaries stop the classic
// false positive ("SOC" matching "SOCial"). Empty beats wrong.
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const SECURITY_ROLE_RE =
  /\b(ciso|cso|cio|cto|security|infosec|cyber|secops|soc|siem|grc|compliance|risk officer|identity|iam|privacy|data protection|dpo|it director|head of it|vp engineering|head of engineering|technology officer)\b/;
function titleRelevant(title: string, icpTitles: string[]): boolean {
  const t = (title || '').toLowerCase().trim();
  if (!t) return false;
  for (const raw of icpTitles) {
    const target = (raw || '').toLowerCase().trim();
    if (!target) continue;
    if (new RegExp(`\\b${escapeRe(target)}\\b`).test(t)) return true;
    if (t.length >= 3 && new RegExp(`\\b${escapeRe(t)}\\b`).test(target)) return true;
  }
  return SECURITY_ROLE_RE.test(t);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const apolloKey = Deno.env.get('APOLLO_API_KEY');
  if (!apolloKey) return json({ error: 'APOLLO_API_KEY not set' }, 500);

  let body: {
    domain?: string;
    org_id?: string;
    titles?: string[];
    seniorities?: string[];
    exclude_apollo_id?: string;
    limit?: number;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const domain = (body.domain || '').trim().toLowerCase();
  if (!domain) return json({ error: 'domain is required' }, 400);
  const orgId = String(body.org_id || '').trim();
  const limit = Math.min(Math.max(body.limit ?? 25, 1), 100);
  const titles = Array.isArray(body.titles) ? body.titles.filter(Boolean) : [];
  const seniorities = Array.isArray(body.seniorities)
    ? body.seniorities.filter(Boolean)
    : [];
  const excludeId = (body.exclude_apollo_id || '').trim();

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  // Auth scoping: caller must own this domain via watchlist or leads. People
  // search is free, but we only surface it for accounts the org has added —
  // adding an account is the gate (and enforces the plan cap). Return a plain,
  // actionable message so the caller knows to add the account first, rather
  // than a bare 404 the MCP client renders as "non-2xx status code".
  const [{ data: leads }, { data: watch }] = await Promise.all([
    userClient.from('leads').select('id').ilike('company_domain', domain).limit(1),
    userClient.from('watchlist').select('id').ilike('company_domain', domain).limit(1),
  ]);
  if ((leads?.length ?? 0) === 0 && (watch?.length ?? 0) === 0) {
    return json(
      {
        error: `Add ${domain} to your accounts first, then you can look up its people.`,
      },
      404,
    );
  }

  // 1. Apollo search (free)
  const payload: Record<string, unknown> = {
    q_organization_domains_list: [domain],
    per_page: limit,
    page: 1,
  };
  if (titles.length > 0) payload.person_titles = titles;
  if (seniorities.length > 0) payload.person_seniorities = seniorities;

  let apolloResp: Response;
  try {
    apolloResp = await fetch(APOLLO_ENDPOINT, {
      method: 'POST',
      headers: { 'X-Api-Key': apolloKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return json({ error: `Apollo request failed: ${String(e)}` }, 502);
  }
  if (!apolloResp.ok) {
    const text = await apolloResp.text();
    return json({ error: `Apollo ${apolloResp.status}`, detail: text.slice(0, 500) }, 502);
  }
  const parsed = await apolloResp.json();
  const peopleRaw: any[] = Array.isArray(parsed.people) ? parsed.people : [];

  // 2. Lookup unlocked rows in this org for these apollo_ids (RLS scopes to org)
  const ids = peopleRaw.map((p) => p?.id).filter(Boolean);
  let unlockedById: Record<string, any> = {};
  if (ids.length > 0) {
    const { data: unlocked } = await userClient
      .from('apollo_people_cache')
      .select('apollo_id, person_data')
      .in('apollo_id', ids);
    for (const row of unlocked ?? []) {
      unlockedById[row.apollo_id] = row.person_data;
    }
  }

  // 3. Project + merge + apply exclude filter
  const people = peopleRaw
    .filter((p) => !excludeId || p?.id !== excludeId)
    .map((p) => {
      const apollo_id = p?.id ?? null;
      const cached = apollo_id ? unlockedById[apollo_id] : null;
      const src = cached ?? p;
      const org = src?.organization ?? p?.organization ?? {};
      return {
        apollo_id,
        first_name: src?.first_name ?? p?.first_name ?? '',
        last_name: cached?.last_name ?? src?.last_name ?? '',
        last_name_obfuscated: p?.last_name_obfuscated ?? '',
        title: src?.title ?? p?.title ?? '',
        seniority: p?.seniority ?? '',
        linkedin_url: src?.linkedin_url ?? p?.linkedin_url ?? '',
        country: p?.country ?? '',
        city: p?.city ?? '',
        state: p?.state ?? '',
        headline: p?.headline ?? '',
        departments: p?.departments ?? [],
        company_name: org?.name ?? '',
        // Coherent with the row, not just Apollo's live flag: a cached
        // (revealed) address counts as having an email even when Apollo's
        // current search row says none is available (otherwise the email
        // is populated while has_email says false).
        has_email: !!cached?.email || !!(p?.has_email),
        has_phone: !!(p?.has_direct_phone) && p?.has_direct_phone !== 'No',
        email: cached?.email ?? null,
        phone_numbers: cached?.phone_numbers ?? null,
        unlocked: !!cached,
      };
    });

  // Relevance — deterministic pre-filter (free, drops obvious junk instantly),
  // then the engine's LLM verdicts (score + 'why they fit' reason), ranked
  // best-fit first. Falls back to the deterministic list if the engine is slow
  // or unreachable, so the drawer never breaks on a relevance hiccup.
  let ranked = titles.length > 0 ? people.filter((p) => titleRelevant(p.title, titles)) : people;

  if (titles.length > 0 && orgId && ranked.length > 0 && ENGINE_KEY) {
    // Engine URL without /api/v1 (same value as the dashboard's). A missing
    // value is a misconfiguration, not a relevance hiccup, so fail loudly.
    const engineBase = Deno.env.get('ENGINE_API_BASE')?.replace(/\/+$/, '');
    if (!engineBase) return json({ error: 'ENGINE_API_BASE not set' }, 500);
    try {
      const resp = await fetch(`${engineBase}/api/v1/relevance/titles`, {
        method: 'POST',
        headers: { 'X-API-Key': ENGINE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId, titles: ranked.map((p) => p.title) }),
        signal: AbortSignal.timeout(9000),
      });
      if (resp.ok) {
        const { verdicts } = await resp.json();
        ranked = ranked
          .map((p) => {
            const v = (verdicts && verdicts[p.title]) || {};
            return {
              ...p,
              relevance_score: typeof v.score === 'number' ? v.score : 0.4,
              relevance_reason: typeof v.reason === 'string' ? v.reason : '',
              _relevant: v.relevant !== false,
            };
          })
          .filter((p) => p._relevant)
          .sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))
          .map(({ _relevant, ...p }) => p);
      }
    } catch (_e) {
      // engine unreachable/slow — keep the deterministic-filtered list.
    }
  }

  return json({ domain, people: ranked, total: ranked.length });
});
