"use client";

/**
 * WhoToContactToday — the morning worklist. Every row answers the rep's
 * actual question (who do I contact today and why) with a named person,
 * the account, the trigger, and a link to act.
 *
 * Sources, in rank order:
 *   1. Hot/warm scored leads with a fresh hook (ActOnToday's ranking) —
 *      these carry a person, a reason and an approach angle already.
 *   2. Last-7-days signals on watched accounts that NAME a person
 *      (signal_data.person_name, written by the person monitor).
 *   3. Account-level signals (leaks, CVEs, funding) mapped to the
 *      account's top cached key contact, so even a company-shaped trigger
 *      surfaces a human to open with.
 *
 * North-star "next-action worklist" v1 (2026-07-16 sim, Marcus: every
 * morning surface named accounts, never people).
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Check, UserRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  EmptyState,
  SectionHeader,
  Shimmer,
} from "@/components/dashboard/primitives";
import {
  useLeads,
  useMarkReachedOut,
  useSignals,
  useWatchlist,
} from "@/lib/dashboard/queries";
import { proxiedAvatar, scrubBackendNames, signalTypeLabel } from "@/lib/dashboard/labels";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Lead } from "@/lib/dashboard/types";

const DAY = 24 * 60 * 60 * 1000;
const SHOW = 5;

type Row = {
  key: string;
  person: string;
  title: string | null;
  company: string;
  why: string;
  href: string;
  at: number;
  /** 1-3, rendered as the same flame scale the account lists use. */
  heat: 1 | 2 | 3;
  leadId?: string;
  photo: string | null;
};

function num(v: string | number | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function freshTs(l: Lead): number {
  const c = [l.first_hot_at, l.scored_at, l.enriched_at, l.updated_at]
    .map((v) => (v ? new Date(v).getTime() : 0))
    .filter((n) => n > 0);
  return c.length ? Math.max(...c) : 0;
}

/** Watched-domain company facts incl. the top cached key contact. */
function useKeyContacts(domains: string[]) {
  return useQuery({
    queryKey: ["wtc_key_contacts", [...domains].sort()],
    enabled: domains.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await createSupabaseBrowserClient()
        .from("companies")
        .select("id, domain, name, key_contacts")
        .in("domain", domains);
      if (error) throw error;
      const byDomain = new Map<
        string,
        {
          id: string;
          name: string | null;
          contact: { name: string; title: string | null; photo: string | null } | null;
        }
      >();
      const domainById = new Map<string, string>();
      for (const c of (data ?? []) as Array<{
        id: string;
        domain: string | null;
        name: string | null;
        key_contacts: Array<{
          name?: string;
          title?: string;
          icp_score?: number;
          photo_url?: string;
        }> | null;
      }>) {
        if (!c.domain) continue;
        const dom = c.domain.toLowerCase();
        domainById.set(c.id, dom);
        const best = (c.key_contacts ?? [])
          .filter((k) => k?.name)
          .sort((a, b) => (b.icp_score ?? 0) - (a.icp_score ?? 0))[0];
        byDomain.set(dom, {
          id: c.id,
          name: c.name,
          contact: best
            ? {
                name: best.name!,
                title: best.title ?? null,
                photo: best.photo_url ?? null,
              }
            : null,
        });
      }
      return { byDomain, domainById };
    },
  });
}

export function useWorklist(): { rows: Row[]; loading: boolean } {
  const { data: leads, isLoading: leadsLoading } = useLeads();
  const { data: signals, isLoading: signalsLoading } = useSignals();
  const { data: watchlist } = useWatchlist();

  const watchedDomains = useMemo(
    () =>
      [...new Set(
        (watchlist ?? [])
          .map((w) => (w.company_domain ?? "").toLowerCase())
          .filter(Boolean),
      )],
    [watchlist],
  );
  const { data: facts } = useKeyContacts(watchedDomains);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const seen = new Set<string>();

    // 1. Scored leads — a person, a reason, an angle, ready to draft.
    const hotLeads = (leads ?? [])
      .filter(
        (l) =>
          (l.lead_rating === "hot" || l.lead_rating === "warm") && !l.outreach_at,
      )
      .sort((a, b) => {
        const da = (Date.now() - freshTs(a)) / DAY;
        const db = (Date.now() - freshTs(b)) / DAY;
        return num(b.total_score) - db * 1.5 - (num(a.total_score) - da * 1.5);
      })
      .slice(0, 3);
    for (const l of hotLeads) {
      const person =
        [l.first_name, l.last_name].filter(Boolean).join(" ") || l.email || "";
      if (!person) continue;
      const dedupe = `${person}|${l.company_name ?? ""}`.toLowerCase();
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({
        key: `lead:${l.id}`,
        person,
        title: l.title ?? null,
        company: l.company_name ?? l.company_domain ?? "",
        why: scrubBackendNames(
          l.rating_reason ?? l.best_approach_angle ?? "Scored hot this week.",
        ),
        href: `/dashboard/prospects/${l.id}`,
        at: freshTs(l),
        heat: l.lead_rating === "hot" ? 3 : 2,
        leadId: l.id,
        photo: l.photo_url ?? null,
      });
    }

    // 2 + 3. Fresh watched-account signals → named person, or the
    // account's top key contact when the trigger is account-level.
    const since = Date.now() - 7 * DAY;
    const domainByCompanyId = facts?.domainById;
    const fresh = [...(signals ?? [])]
      .filter((s) => s.detected_at && new Date(s.detected_at).getTime() >= since)
      .sort(
        (a, b) =>
          new Date(b.detected_at!).getTime() - new Date(a.detected_at!).getTime(),
      );
    for (const s of fresh) {
      if (out.length >= SHOW * 2) break;
      const sd = (s.signal_data ?? {}) as Record<string, unknown>;
      const dom = (
        String(sd.company_domain ?? sd.domain ?? "") ||
        (s.company_id ? domainByCompanyId?.get(s.company_id) ?? "" : "")
      ).toLowerCase();
      if (!dom || !watchedDomains.includes(dom)) continue;
      const fact = facts?.byDomain.get(dom);
      const company = fact?.name ?? String(sd.company_name ?? sd.name ?? dom);
      const personName = String(sd.person_name ?? "").trim();
      const person = personName || fact?.contact?.name || "";
      if (!person) continue;
      const title = personName
        ? String(sd.current_title ?? sd.person_title ?? "").trim() || null
        : fact?.contact?.title ?? null;
      const dedupe = `${person}|${company}`.toLowerCase();
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      const label = signalTypeLabel(s.signal_type ?? "");
      const why = personName
        ? scrubBackendNames(String(sd.headline ?? label))
        : `${label} at ${company}, a reason to open with ${person.split(" ")[0]}.`;
      out.push({
        key: `signal:${s.id}`,
        person,
        title,
        company,
        why,
        href: `/dashboard/accounts/${dom}`,
        at: new Date(s.detected_at!).getTime(),
        heat: personName ? 2 : 1,
        photo: personName
          ? (typeof sd.person_photo_url === "string" && sd.person_photo_url) || null
          : fact?.contact?.photo ?? null,
      });
    }

    return out.slice(0, SHOW);
  }, [leads, signals, watchedDomains, facts]);

  return { rows, loading: leadsLoading || signalsLoading };
}

/** Photo when we have one (leads carry Apollo photos), initials circle
 *  when we don't — never a broken-image glyph. */
function PersonAvatar({ name, photo }: { name: string; photo: string | null }) {
  const [failed, setFailed] = useState(false);
  // Route through the avatar proxy — Apollo/LinkedIn photo URLs are
  // hotlink-blocked, so a raw <img src> fails and falls back to initials.
  const src = proxiedAvatar(photo);
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={36}
        height={36}
        onError={() => setFailed(true)}
        className="h-9 w-9 shrink-0 rounded-full border border-border-subtle object-cover"
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-[12px] font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
      {initials || "?"}
    </div>
  );
}

export function WhoToContactToday() {
  const { rows, loading } = useWorklist();
  const mark = useMarkReachedOut();

  // The action loop, closed: how many people were actually contacted
  // this week (outreach_at set via the check button or the lead page).
  const { data: leads } = useLeads();
  const contacted = useMemo(() => {
    const since = Date.now() - 7 * DAY;
    return (leads ?? []).filter(
      (l) => l.outreach_at && new Date(l.outreach_at).getTime() >= since,
    ).length;
  }, [leads]);

  return (
    <Card delay={0.12} id="who-to-contact" className="h-full scroll-mt-24 overflow-hidden">
      <div className="border-b border-border-subtle p-6 md:p-7">
        <SectionHeader
          title="Who to contact today"
          right={
            contacted > 0 ? (
              <span className="text-[11.5px] text-text-muted">
                {contacted} contacted this week
              </span>
            ) : undefined
          }
        />
      </div>
      {loading ? (
        <div className="flex flex-col gap-3 p-6 md:p-7">
          {[0, 1, 2].map((i) => (
            <Shimmer key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<UserRound size={16} strokeWidth={1.6} />}
          title="No one to chase yet"
          body="As signals land on your watched accounts, the people behind them appear here with the reason to reach out."
        />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {rows.map((r) => (
            <li
              key={r.key}
              title={r.why}
              className="relative flex items-center gap-3 px-5 py-3 transition-colors hover:bg-bg-elevated/40 md:px-7"
            >
              {/* Stretched link makes the whole row navigate; the check
                  button below is positioned so it stays independently
                  clickable above it. */}
              <Link
                href={r.href}
                aria-label={`${r.person} at ${r.company}`}
                className="absolute inset-0"
              />
              <PersonAvatar name={r.person} photo={r.photo} />
              <div className="flex min-w-0 flex-1 items-baseline gap-x-2">
                <span className="whitespace-nowrap text-[13.5px] font-medium text-text-primary">
                  {r.person}
                </span>
                <span className="truncate text-[12px] text-text-muted">{r.company}</span>
              </div>
              <div className="relative flex shrink-0 items-center gap-1.5">
                {r.leadId && (
                  <button
                    type="button"
                    title="Mark reached out"
                    onClick={() => mark.mutate(r.leadId!)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border-default text-text-muted transition-colors hover:border-accent/50 hover:text-text-primary"
                  >
                    <Check size={13} strokeWidth={2} />
                  </button>
                )}
                <span
                  aria-hidden
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border-default text-text-muted"
                >
                  <ArrowUpRight size={13} strokeWidth={2} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
