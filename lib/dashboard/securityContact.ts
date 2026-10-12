// Derives the "security contact" for an account from the org's leads — the
// named security decision-maker (CISO / Head of Security / etc.), not the
// generic security.txt inbox. For a cyber vendor the CISO is the buyer, so we
// surface them as the headline contact on the account (table + detail page).

import type { Lead } from "@/lib/dashboard/types";

export interface SecurityContactInfo {
  name: string;
  title: string;
  email: string | null;
  linkedin_url: string | null;
  /** True when sourced from companies.key_contacts (discovered but not yet
   *  unlocked — no contact details). The table marks these as locked so a
   *  rep knows they still need to unlock before reaching out. */
  discovered?: boolean;
  /** Set when this contact has been unlocked into a lead — lets the cell
   *  deep-link to the lead. Present on unlocked key_contacts entries. */
  lead_id?: string | null;
}

// Security LEADERSHIP titles — CISO/CSO, "chief … security officer",
// "head of (cyber|information) security", and VP/Director/Head … security.
const POSITIVE =
  /\b(ciso|cso)\b|chief\s+(information\s+)?security\s+officer|chief\s+security\s+officer|head\s+of\s+(cyber\s*security|information\s+security|cyber|security)|(vp|vice\s+president|svp|director|global\s+head|head|lead)\b[^,]{0,40}\b(cyber\s*security|information\s+security|infosec|security)\b/i;
// Exclude non-IT "security" roles that would otherwise match.
const NEGATIVE =
  /physical\s+security|security\s+guard|loss\s+prevention|national\s+security|security\s+clearance|food\s+security|social\s+security/i;

export function isSecurityLeader(title?: string | null): boolean {
  if (!title) return false;
  if (NEGATIVE.test(title)) return false;
  return POSITIVE.test(title);
}

function toContact(l: Lead): SecurityContactInfo | null {
  const name = [l.first_name, l.last_name].filter(Boolean).join(" ").trim();
  if (!name) return null;
  return {
    name,
    title: l.title ?? "",
    email: l.email ?? null,
    linkedin_url: l.linkedin_url ?? null,
  };
}

/** The single best security contact for one account's domain, or null. */
export function pickSecurityContact(
  leads: Lead[] | undefined,
  domain: string,
): SecurityContactInfo | null {
  if (!leads || !domain) return null;
  const d = domain.toLowerCase();
  const matches = leads.filter(
    (l) => (l.company_domain ?? "").toLowerCase() === d && isSecurityLeader(l.title),
  );
  if (matches.length === 0) return null;
  // Prefer a contactable (email present) lead, then highest score.
  matches.sort((a, b) => {
    const ae = a.email ? 1 : 0;
    const be = b.email ? 1 : 0;
    if (ae !== be) return be - ae;
    return Number(b.total_score ?? 0) - Number(a.total_score ?? 0);
  });
  return toContact(matches[0]);
}

interface KeyContactRaw {
  name?: string | null;
  title?: string | null;
  linkedin_url?: string | null;
  icp_score?: number | null;
  apollo_id?: string | null;
}

/** Minimal shape of an org-scoped unlock record (see useMyUnlocks). */
export interface UnlockLookup {
  lead_id: string | null;
  email: string | null;
}

function topBySecurityThenScore(pool: KeyContactRaw[]): KeyContactRaw {
  const security = pool.filter((k) => isSecurityLeader(k.title));
  const ranked = security.length > 0 ? security : pool;
  return [...ranked].sort(
    (a, b) => Number(b.icp_score ?? 0) - Number(a.icp_score ?? 0),
  )[0];
}

/**
 * Contact from the account's `key_contacts` (person-intel discovery), used when
 * no unlocked security LEAD exists for the domain. key_contacts is GLOBAL
 * (shared by every org watching the domain) and carries discovery fields only —
 * unlock state comes from `unlocksByApolloId` (this org's apollo_people_cache
 * rows, see useMyUnlocks). An entry unlocked BY THIS ORG wins and is returned
 * as unlocked (discovered: false) carrying its lead_id. Otherwise the top
 * security-titled (else highest ICP-scored) entry is returned as
 * discovered/locked.
 */
export function pickDiscoveredContact(
  keyContacts: unknown,
  unlocksByApolloId?: Map<string, UnlockLookup>,
): SecurityContactInfo | null {
  if (!Array.isArray(keyContacts) || keyContacts.length === 0) return null;
  const list = (keyContacts as KeyContactRaw[]).filter(
    (k) => k && typeof k.name === "string" && k.name.trim().length > 0,
  );
  if (list.length === 0) return null;

  const unlockFor = (k: KeyContactRaw): UnlockLookup | undefined =>
    k.apollo_id ? unlocksByApolloId?.get(String(k.apollo_id)) : undefined;

  const unlocked = list.filter((k) => !!unlockFor(k));
  if (unlocked.length > 0) {
    const top = topBySecurityThenScore(unlocked);
    const rec = unlockFor(top);
    return {
      name: top.name!.trim(),
      title: top.title ?? "",
      email: rec?.email ?? null,
      linkedin_url: (top.linkedin_url && top.linkedin_url.trim()) || null,
      lead_id: rec?.lead_id ?? null,
      discovered: false,
    };
  }

  const top = topBySecurityThenScore(list);
  return {
    name: top.name!.trim(),
    title: top.title ?? "",
    email: null,
    linkedin_url: (top.linkedin_url && top.linkedin_url.trim()) || null,
    discovered: true,
  };
}

/**
 * One pass over all org leads → a domain → best-security-contact map, for the
 * accounts table. Assumes `leads` is already sorted by score desc (the
 * useLeads query is), so the first security leader seen per domain is the
 * top-scored; we only upgrade to a later one if it adds an email.
 */
export function buildSecurityContactMap(
  leads: Lead[] | undefined,
): Map<string, SecurityContactInfo> {
  const map = new Map<string, SecurityContactInfo>();
  if (!leads) return map;
  for (const l of leads) {
    const d = (l.company_domain ?? "").toLowerCase();
    if (!d || !isSecurityLeader(l.title)) continue;
    const cand = toContact(l);
    if (!cand) continue;
    const existing = map.get(d);
    if (!existing) {
      map.set(d, cand);
    } else if (!existing.email && cand.email) {
      map.set(d, cand);
    }
  }
  return map;
}
