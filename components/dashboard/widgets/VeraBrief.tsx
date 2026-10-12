"use client";

/**
 * Vera's morning nudge — the single most worth-acting-on thing the daily
 * monitor found, in plain language with a link to go look. Rule-based, NO AI:
 * every signal_type maps to a category (signalCategories.classifyType), each
 * category has a casual template, and the "other_signals" catch-all means a
 * new or unknown type never breaks or reads as generated.
 *
 * `useVeraNudge()` is the shared brain. On HomeV2 the sentence is appended
 * straight onto the "Welcome, {name}." heading (one sentence). The legacy
 * `VeraBrief` card (legacy home) renders it with a greeting.
 *
 * Voice: casual, no em dashes.
 */

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { useOrg } from "@/components/dashboard/OrgContext";
import { Card, Shimmer } from "@/components/dashboard/primitives";
import { useSignals, useWatchlist } from "@/lib/dashboard/queries";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  classifyType,
  type SignalCategory,
} from "@/lib/dashboard/signalCategories";
import type { Signal } from "@/lib/dashboard/types";

const DAY_MS = 24 * 60 * 60 * 1000;

// Body-only templates. {name} is the account. One per category; other_signals
// is the catch-all for anything unmapped. Lowercase-start so they read after a
// greeting comma; HomeV2 capitalises the first letter when it follows a period.
const TEMPLATES: Record<SignalCategory, (name: string, who?: string) => string> = {
  credential_exposure: (n) => `credentials just leaked for ${n}, go check it out.`,
  breach: (n) => `a breach just hit ${n}'s sector, could be a timely angle.`,
  cve_exposure: (n) => `spotted a CVE in ${n}'s stack, might be one to flag.`,
  funding: (n) => `${n} just raised a round, good time to get in front of them?`,
  acquisition: (n) => `there's some M&A going on at ${n}, things will be moving over there.`,
  security_leadership: (n) => `${n} just brought in a new security lead, worth a look?`,
  leadership_change: (n) => `there's been a leadership change at ${n}, could be an opening.`,
  cyber_job_intent: (n) => `${n} is hiring around security tooling, decent sign they're investing.`,
  hiring: (n) => `${n} just posted a security role, might be worth a look?`,
  person_activity: (n, who) =>
    `${who ?? "someone"} at ${n} posted something relevant on LinkedIn, could be a way in.`,
  social_chatter: (n) => `people are talking about ${n} on social, might be worth a peek.`,
  partnership: (n) => `${n} announced a new partnership, one to keep an eye on.`,
  expansion: (n) => `${n} is expanding, growth usually brings new security needs.`,
  product_launch: (n) => `${n} just launched something new, could be a reason to reach out.`,
  tech_change: (n) => `${n} changed something in their stack, might be worth a look.`,
  enterprise_readiness: (n) => `${n} is pushing upmarket, security scrutiny usually follows.`,
  security_posture: (n) => `${n} has been tidying up their security pages, they're thinking about it.`,
  company_news: (n) => `bit of news from ${n} today, worth a quick look.`,
  other_signals: (n) => `something's moving at ${n}, worth a look?`,
};

// Nudge urgency: the highest-priority category that fired in the last 24h
// wins. Strongest and most time-sensitive first; soft context last.
const NUDGE_PRIORITY: SignalCategory[] = [
  "credential_exposure",
  "breach",
  "cve_exposure",
  "funding",
  "acquisition",
  "security_leadership",
  "leadership_change",
  "cyber_job_intent",
  "hiring",
  "person_activity",
  "social_chatter",
  "partnership",
  "expansion",
  "product_launch",
  "tech_change",
  "enterprise_readiness",
  "security_posture",
  "company_news",
  "other_signals",
];
const PRIORITY_INDEX = Object.fromEntries(
  NUDGE_PRIORITY.map((c, i) => [c, i]),
) as Record<SignalCategory, number>;

export interface NudgeAccount {
  name: string;
  domain: string;
}

export type VeraNudge =
  | { status: "loading" }
  | { status: "empty" } // no accounts yet
  | { status: "quiet" } // accounts, but nothing in the last 24h
  | { status: "nudge"; body: string; account: NudgeAccount; more: number };

export function useVeraNudge(): VeraNudge {
  const { orgId } = useOrg();
  const { data: signals, isLoading: signalsLoading } = useSignals();
  const { data: watchlist, isLoading: watchlistLoading } = useWatchlist();

  // company_id → domain for the watched accounts. Account-level signals
  // (credential leaks, CVEs) carry only company_id, so without this they
  // can't be resolved to a watchlist account and get skipped.
  const watchedDomains = useMemo(
    () => [
      ...new Set(
        (watchlist ?? [])
          .map((w) => (w.company_domain ?? "").toLowerCase())
          .filter(Boolean),
      ),
    ],
    [watchlist],
  );
  const { data: companyIdToDomain } = useQuery({
    queryKey: ["vera_nudge_company_map", orgId, watchedDomains],
    enabled: !!orgId && watchedDomains.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await createSupabaseBrowserClient()
        .from("companies")
        .select("id, domain")
        .in("domain", watchedDomains);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const c of (data ?? []) as { id: string; domain: string | null }[]) {
        if (c.id && c.domain) map[c.id] = c.domain.toLowerCase();
      }
      return map;
    },
  });

  return useMemo<VeraNudge>(() => {
    if (signalsLoading || watchlistLoading) return { status: "loading" };
    if (!watchlist || watchlist.length === 0) return { status: "empty" };
    if (!signals) return { status: "quiet" };

    // Account lookups from the watchlist (the source of name + domain for the
    // sentence and the link). Resolve a signal by lead_id, then by the domain
    // / name embedded in signal_data.
    const byLead = new Map<string, NudgeAccount>();
    const byDomain = new Map<string, NudgeAccount>();
    const byName = new Map<string, NudgeAccount>();
    for (const w of watchlist) {
      const domain = (w.company_domain ?? "").toLowerCase();
      const name = w.company_name || w.company_domain || "this account";
      const acct: NudgeAccount = { name, domain };
      if (domain) byDomain.set(domain, acct);
      if (w.lead_id) byLead.set(w.lead_id, acct);
      if (w.company_name) byName.set(w.company_name.toLowerCase(), acct);
    }

    function resolve(s: Signal): NudgeAccount | null {
      if (s.lead_id && byLead.has(s.lead_id)) return byLead.get(s.lead_id)!;
      // Account-level signals (credential leaks, CVEs) carry only company_id.
      if (s.company_id) {
        const dom = companyIdToDomain?.[s.company_id];
        if (dom && byDomain.has(dom)) return byDomain.get(dom)!;
      }
      const sd = (s.signal_data ?? {}) as Record<string, unknown>;
      const dom = String(sd.company_domain ?? sd.domain ?? "").toLowerCase();
      if (dom && byDomain.has(dom)) return byDomain.get(dom)!;
      const nm = String(sd.company_name ?? sd.name ?? "").toLowerCase();
      if (nm && byName.has(nm)) return byName.get(nm)!;
      return null;
    }

    const since = Date.now() - DAY_MS;
    type Hit = {
      account: NudgeAccount;
      category: SignalCategory;
      at: number;
      who?: string;
    };
    const hits: Hit[] = [];
    for (const s of signals) {
      if (!s.detected_at) continue;
      const at = new Date(s.detected_at).getTime();
      if (at < since) continue;
      const account = resolve(s);
      if (!account) continue; // can't name or link it — skip, never guess
      // The person behind a person-driven signal (person_monitor writes
      // person_name) — the rep's question is WHO, so name them when known.
      const sd = (s.signal_data ?? {}) as Record<string, unknown>;
      const personName = String(sd.person_name ?? "").trim();
      const who =
        personName && !personName.includes("@") && personName.length <= 60
          ? personName
          : undefined;
      hits.push({ account, category: classifyType(s.signal_type), at, who });
    }
    if (hits.length === 0) return { status: "quiet" };

    hits.sort((a, b) => {
      const d = PRIORITY_INDEX[a.category] - PRIORITY_INDEX[b.category];
      return d !== 0 ? d : b.at - a.at;
    });
    const top = hits[0];
    const topKey = top.account.domain || top.account.name;
    const others = new Set(
      hits
        .map((h) => h.account.domain || h.account.name)
        .filter((k) => k !== topKey),
    );

    return {
      status: "nudge",
      body: TEMPLATES[top.category](top.account.name, top.who),
      account: top.account,
      more: others.size,
    };
  }, [signals, watchlist, signalsLoading, watchlistLoading, companyIdToDomain]);
}

/** Small clickable arrow that links through to the account. Sized to the
 *  surrounding text. */
export function NudgeArrow({
  account,
  size = 18,
}: {
  account: NudgeAccount;
  size?: number;
}) {
  if (!account.domain) return null;
  return (
    <Link
      href={`/dashboard/accounts/${account.domain}`}
      aria-label={`Open ${account.name}`}
      className="ml-1.5 inline-block align-middle text-accent transition-opacity hover:opacity-70"
    >
      <ArrowUpRight size={size} strokeWidth={2.2} className="inline" />
    </Link>
  );
}

function timeOfDay(): "Morning" | "Afternoon" | "Evening" {
  const h = new Date().getHours();
  if (h < 12) return "Morning";
  if (h < 18) return "Afternoon";
  return "Evening";
}

/** Legacy home card: greeting + nudge line. The
 *  HomeV2 layout doesn't use this — it appends useVeraNudge() onto its
 *  heading instead. */
export function VeraBrief() {
  const { firstName } = useOrg();
  const nudge = useVeraNudge();
  const greeting = `${timeOfDay()} ${firstName || "there"}`;

  const wrap = (children: ReactNode) => (
    <Card className="p-6 md:p-7">
      <p className="text-[15px] leading-relaxed text-text-primary">{children}</p>
    </Card>
  );

  if (nudge.status === "loading") {
    return (
      <Card className="p-6 md:p-7">
        <Shimmer className="h-5 w-2/3" />
      </Card>
    );
  }
  if (nudge.status === "empty") {
    return wrap(
      `${greeting}, add a few accounts and Vera will start watching them for you.`,
    );
  }
  if (nudge.status === "quiet") {
    return wrap(
      `${greeting}, quiet one today. Might be a good time to add a few new accounts.`,
    );
  }
  return wrap(
    <>
      {greeting}, {nudge.body}
      {nudge.more > 0 && (
        <span className="text-text-muted"> + {nudge.more} more that need{nudge.more === 1 ? "s" : ""} your attention</span>
      )}
      <NudgeArrow account={nudge.account} size={18} />
    </>,
  );
}
