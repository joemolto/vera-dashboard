// Apollo company-search. Two modes:
//
//  1. Default (no overrides): Reads the org's stored ICP (industries,
//     locations, employee bands) and asks Apollo for matching companies.
//     Used by the "Suggested accounts" row on /dashboard/accounts.
//
//  2. Override mode: Caller passes explicit filters. Stored ICP is
//     IGNORED. Used by the chat agent's `find_companies` tool so reps
//     can ad-hoc search without changing their saved ICP.
//
// v3 2026-05-28: fix normaliseEmployeeRange regex.
// v4 2026-05-29: add override mode for ad-hoc agent searches.
// v5 2026-05-29: strict post-fetch industry filter (industry field only).
// v6 2026-05-29: loosen post-fetch filter — v5 dropped 19/19 legit
//   insurance results because Apollo's `industry` field often returns
//   "Financial Services" or null.
// v11 2026-08-19: two compounding fixes.
//   (a) Apollo's search response stopped carrying industry/keywords/
//       description entirely (verified 2026-08-13 during the market-radar
//       build), so the v6 haystack collapsed to just the company NAME —
//       only companies with the industry word in their name survived
//       ("Example Insurance UK" passed an insurance filter; every fintech
//       failed a fintech one). The filter now only drops a candidate when
//       there IS real industry data and it mismatches; a row with no
//       industry data passes (noisy beats empty for suggestions).
//   (b) The response comes back in TWO buckets — `organizations`
//       (net-new) and `accounts` (already saved in the Apollo
//       workspace) — and v10 read one OR the other. In a workspace
//       with thousands of saved accounts, page 1 is mostly the accounts
//       bucket and apollo_returned collapsed to single digits. Both
//       buckets now merge (deduped by domain), with the accounts
//       bucket's `organization_id` used as the apollo org id.
//
// NOTE: this file is the version-controlled source of the DEPLOYED edge
// function (deployed via Supabase MCP/CLI, not by Vercel). If you edit
// here, redeploy; if you hotfix in the dashboard, copy back here.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const APOLLO_ENDPOINT = 'https://api.apollo.io/api/v1/mixed_companies/search';

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

function cleanList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === 'string')
    return v.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

function normaliseEmployeeRange(s: string): string | null {
  const trimmed = s.trim();
  const apolloFormat = trimmed.match(/^(\d+),(\d+)$/);
  if (apolloFormat) return `${apolloFormat[1]},${apolloFormat[2]}`;
  const stripped = trimmed.replace(/[,\s]/g, '');
  const dashMatch = stripped.match(/^(\d+)[\-–—](\d+)$/);
  if (dashMatch) return `${dashMatch[1]},${dashMatch[2]}`;
  return null;
}

function employeeRangesFromOverride(
  ranges?: string[],
  min?: number | null,
  max?: number | null,
): string[] | null {
  if (ranges && ranges.length > 0) {
    const normalised = ranges
      .map(normaliseEmployeeRange)
      .filter((s): s is string => s !== null);
    return normalised.length > 0 ? normalised : null;
  }
  if (min == null && max == null) return null;
  const buckets: [number, number][] = [
    [1, 10],
    [11, 50],
    [51, 200],
    [201, 500],
    [501, 1000],
    [1001, 5000],
    [5001, 10000],
    [10001, 1000000],
  ];
  const lo = typeof min === 'number' ? min : 0;
  const hi = typeof max === 'number' ? max : Number.MAX_SAFE_INTEGER;
  const matched = buckets
    .filter(([a, b]) => b >= lo && a <= hi)
    .map(([a, b]) => `${a},${b}`);
  return matched.length > 0 ? matched : null;
}

function sizeRangesForOrg(
  targetSizes: string[],
  enterpriseThreshold: number | null,
): string[] {
  const fromExplicit = targetSizes
    .map(normaliseEmployeeRange)
    .filter((s): s is string => s !== null);
  if (fromExplicit.length > 0) return fromExplicit;
  if (enterpriseThreshold && enterpriseThreshold > 0) {
    return ['51,200', '201,500', '501,1000', '1001,5000', '5001,10000', '10001,1000000'];
  }
  return ['11,50', '51,200', '201,500', '501,1000', '1001,5000', '5001,10000', '10001,1000000'];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const apolloKey = Deno.env.get('APOLLO_API_KEY');
  if (!apolloKey) return json({ error: 'APOLLO_API_KEY not set' }, 500);

  interface Body {
    limit?: number;
    industries?: string[];
    locations?: string[];
    keywords?: string[];
    employee_ranges?: string[];
    employee_min?: number;
    employee_max?: number;
  }
  let body: Body = {};
  try {
    body = await req.json();
  } catch {
    /* empty body fine */
  }
  const limit = Math.min(Math.max(body.limit ?? 8, 1), 25);

  const overrideIndustries = cleanList(body.industries);
  const overrideLocations = cleanList(body.locations);
  const overrideKeywords = cleanList(body.keywords);
  const overrideEmployeeRanges = employeeRangesFromOverride(
    body.employee_ranges,
    body.employee_min,
    body.employee_max,
  );
  const overrideMode =
    overrideIndustries.length > 0 ||
    overrideLocations.length > 0 ||
    overrideKeywords.length > 0 ||
    overrideEmployeeRanges !== null;

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: orgs, error: orgErr } = await userClient
    .from('organisations')
    .select('id, icp_config, client_context')
    .limit(1);
  if (orgErr) return json({ error: orgErr.message }, 500);
  if (!orgs?.length) return json({ error: 'No org for this user' }, 403);
  const org = orgs[0];

  let industries: string[];
  let locations: string[];
  let employeeRanges: string[];
  let keywords: string[];

  if (overrideMode) {
    industries = overrideIndustries;
    locations = overrideLocations;
    keywords = overrideKeywords;
    employeeRanges = overrideEmployeeRanges ?? [
      '1,10', '11,50', '51,200', '201,500', '501,1000', '1001,5000', '5001,10000', '10001,1000000',
    ];
  } else {
    const icp = (org.icp_config ?? {}) as Record<string, unknown>;
    const ctx = (org.client_context ?? {}) as Record<string, unknown>;
    const industriesRaw = [
      ...cleanList(ctx.high_value_segments),
      ...cleanList(icp.target_industries),
    ];
    industries = Array.from(new Set(industriesRaw.map((s) => s.toLowerCase())));
    const locationsRaw = [
      ...cleanList(icp.target_locations),
      ...cleanList(ctx.target_locations),
    ];
    locations = Array.from(new Set(locationsRaw));
    keywords = [];
    const targetSizes = cleanList(icp.target_company_size);
    const enterpriseThresholdRaw = ctx.enterprise_threshold_employee_count;
    const enterpriseThreshold =
      typeof enterpriseThresholdRaw === 'number'
        ? enterpriseThresholdRaw
        : typeof enterpriseThresholdRaw === 'string'
          ? Number(enterpriseThresholdRaw)
          : null;
    employeeRanges = sizeRangesForOrg(targetSizes, enterpriseThreshold);
  }

  const payload: Record<string, unknown> = {
    per_page: 50,
    page: 1,
    organization_num_employees_ranges: employeeRanges,
  };
  const allKeywordTags = Array.from(
    new Set([...industries, ...keywords].filter(Boolean)),
  );
  if (allKeywordTags.length > 0) {
    payload.q_organization_keyword_tags = allKeywordTags;
  }
  if (locations.length > 0) payload.organization_locations = locations;

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

  // v11: merge BOTH response buckets. `organizations` rows carry
  // primary_domain + id; `accounts` rows carry domain + organization_id
  // (their `id` is an Apollo ACCOUNT id — wrong for downstream org
  // lookups, never use it).
  const candidates: Array<Record<string, unknown>> = [];
  if (Array.isArray(parsed.organizations)) {
    for (const o of parsed.organizations) {
      if (o && typeof o === 'object') candidates.push(o as Record<string, unknown>);
    }
  }
  if (Array.isArray(parsed.accounts)) {
    for (const a of parsed.accounts) {
      if (a && typeof a === 'object') {
        const obj = a as Record<string, unknown>;
        candidates.push({ ...obj, id: obj.organization_id ?? null });
      }
    }
  }

  const { data: watch } = await userClient
    .from('watchlist')
    .select('company_domain');
  const watching = new Set<string>(
    (watch ?? [])
      .map((w: { company_domain: string }) =>
        (w.company_domain ?? '').toLowerCase(),
      )
      .filter(Boolean),
  );

  // v11 industry filter: Apollo search rows no longer carry industry,
  // keywords or description, so a match-or-drop filter degenerates to
  // name matching. Rule now: drop ONLY when the row has real industry
  // data (beyond its name) that fails to match. No data = keep — the
  // keyword-tag search already targeted the sector, and for suggestions
  // a noisy day beats an empty tray.
  const industryNeedles = industries
    .map((s) => s.toLowerCase().trim())
    .filter(Boolean);
  const applyIndustryFilter = industryNeedles.length > 0;

  const accounts: Array<Record<string, unknown>> = [];
  const seenDomains = new Set<string>();
  let droppedForIndustry = 0;
  for (const obj of candidates) {
    const domain = String(
      obj.primary_domain ?? obj.domain ?? obj.website_url ?? '',
    )
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/^www\./, '')
      .toLowerCase();
    const name = String(obj.name ?? '').trim();
    if (!domain || !name) continue;
    if (seenDomains.has(domain)) continue;
    seenDomains.add(domain);
    if (watching.has(domain)) continue;

    if (applyIndustryFilter) {
      const dataParts: string[] = [];
      if (obj.industry) dataParts.push(String(obj.industry));
      if (Array.isArray(obj.keywords)) {
        for (const k of obj.keywords as unknown[]) {
          if (typeof k === 'string') dataParts.push(k);
        }
      }
      if (Array.isArray(obj.industries)) {
        for (const k of obj.industries as unknown[]) {
          if (typeof k === 'string') dataParts.push(k);
        }
      }
      if (obj.short_description) dataParts.push(String(obj.short_description));
      if (dataParts.length > 0) {
        const haystack = [...dataParts, name].join(' | ').toLowerCase();
        const matched = industryNeedles.some((n) => haystack.includes(n));
        if (!matched) {
          droppedForIndustry += 1;
          continue;
        }
      }
      // No industry data on the row: pass through.
    }

    accounts.push({
      name,
      domain,
      industry: obj.industry ? String(obj.industry) : null,
      size_band: obj.estimated_num_employees
        ? String(obj.estimated_num_employees)
        : null,
      country: obj.organization_country ?? obj.country ?? null,
      apollo_id: obj.id ? String(obj.id) : null,
    });
    if (accounts.length >= limit) break;
  }

  return json({
    accounts,
    total: accounts.length,
    mode: overrideMode ? 'override' : 'icp',
    filters_applied: {
      industries,
      locations,
      keywords,
      employee_ranges: employeeRanges,
    },
    apollo_returned: candidates.length,
    dropped_for_industry_mismatch: droppedForIndustry,
  });
});
