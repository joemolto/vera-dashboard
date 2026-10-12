"use client";

/**
 * PeopleView — the "People" lens on the accounts page (2026-06-11).
 * Same surface, different unit of analysis: instead of
 * companies, the rep sees the people Vera has intelligence on, scored
 * with the same signal logic. Reached via the Accounts | People toggle.
 *
 * Layout mirrors the Accounts table exactly: a CSS
 * grid with fixed pixel column tracks, a deterministic min-width that
 * forces horizontal scroll, and a sticky first column — so the two
 * lenses feel identical to navigate.
 *
 * Reuses the org's leads (useLeads) — every person Vera tracks is a
 * lead row. Intelligence-only: no outreach affordances, just score +
 * freshest person signal + a way into the full person dossier.
 */

import { useMemo, useState } from "react";
import { ArrowUpRight, Radar, Search, Users } from "lucide-react";
import { useLeads, useWatchPerson } from "@/lib/dashboard/queries";
import { EmptyState } from "@/components/dashboard/primitives";
import { PersonDrawer } from "@/components/dashboard/widgets/PersonDrawer";
import { signalTypeLabel, proxiedAvatar } from "@/lib/dashboard/labels";
import { scoreTone } from "@/lib/dashboard/accountScore";
import { logoUrl } from "@/lib/logoUrl";
import { cn } from "@/lib/utils";
import type { Lead } from "@/lib/dashboard/types";

// Column tracks — mirror the Accounts table's grid approach. Explicit
// pixel widths keep header + rows aligned and give a deterministic
// total min-width that forces horizontal scroll on narrow viewports.
//        Person*  Title  Account  Industry  Country  Score  Rating  Freshest signal  ↗
//        sticky
const PEOPLE_COLS =
  "grid-cols-[280px_220px_210px_170px_130px_130px_100px_320px_24px]";
// Sum of widths: 1560. Gaps (20px × 8): 160. Padding: 40. Round up.
const PEOPLE_MIN_W = "min-w-[1780px]";
const STICKY_EDGE = "shadow-[1px_0_0_0_var(--color-border-default,#1f1f23)]";

// The People tab is the people YOU deliberately acquired — unlocked a contact
// (spent a credit / Solo cap) or enriched a specific person — NOT Vera's broader
// lead-gen output. Auto-sourced leads (`apollo`, `vera_brain_apollo`,
// `apollo_discovery`, etc.) live in Prospects; surfacing them here made the tab
// look like a generic lead dump. Whitelist the user-initiated person sources.
const ACQUIRED_PERSON_SOURCES: ReadonlySet<string> = new Set([
  "person_unlock", // unlocked a contact on an account (1 credit / Solo cap)
  "quick_enrich_linkedin", // pasted a person's LinkedIn to enrich
  "multithread", // added a contact via multithreading suggestions
]);

export function isAcquiredPerson(l: Lead): boolean {
  return !!l.source && ACQUIRED_PERSON_SOURCES.has(l.source);
}

function fullName(l: Lead): string {
  return [l.first_name, l.last_name].filter(Boolean).join(" ").trim() || "—";
}

// LinkedIn brand mark — lucide doesn't ship it; copied from the Accounts row
// so the People tab uses the identical glyph.
function LinkedinMark({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.95v5.66H9.36V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

// Inline person-watch toggle — mirrors the Accounts row MonitorToggle exactly,
// so the People tab works the same way: monitor a person straight from the row,
// no drawer. Free + bounded by the Solo "People watched" cap. Needs a LinkedIn
// profile to scrape, so it's disabled (with a hint) without one.
function PersonMonitorToggle({ lead }: { lead: Lead }) {
  const watch = useWatchPerson();
  const active = !!lead.person_monitoring;
  const noLinkedIn = !lead.linkedin_url;
  const title =
    noLinkedIn && !active
      ? "Needs a LinkedIn profile to watch"
      : active
        ? "Vera is watching this person weekly — click to stop"
        : "Click to have Vera watch this person weekly";
  return (
    <button
      type="button"
      disabled={watch.isPending || (noLinkedIn && !active)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        watch.mutate({ leadId: lead.id, active: !active });
      }}
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50",
        active
          ? "bg-accent/10 text-accent hover:bg-accent/20"
          : "border border-border-default text-text-muted hover:border-accent/40 hover:text-accent",
      )}
    >
      <Radar size={10} strokeWidth={2} />
      {active ? "Monitoring" : "Monitor"}
    </button>
  );
}

// Person avatar — LinkedIn/Apollo photo when we have one, falling back
// to the initial on a broken or missing image (LinkedIn CDN URLs can
// hotlink-block, so the fallback matters).
function PersonAvatar({ photo, name }: { photo: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  const src = proxiedAvatar(photo);
  if (!src || failed) {
    return (
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bg-elevated text-[12px] font-medium text-text-primary">
        {initial}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      width={36}
      height={36}
      onError={() => setFailed(true)}
      className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
    />
  );
}

// Company favicon — same source the Accounts table uses, so the two
// lenses share visual language.
function CompanyLogo({ domain, name }: { domain: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  if (!domain || failed) {
    return (
      <div className="grid h-5 w-5 shrink-0 place-items-center rounded border border-border-default bg-bg-elevated text-[9px] font-medium text-text-muted">
        {initial}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl(domain, 128)}
      alt=""
      width={20}
      height={20}
      onError={() => setFailed(true)}
      className="h-5 w-5 shrink-0 rounded border border-border-subtle bg-white object-contain p-0.5"
    />
  );
}

// Score as a mini-bar + number, mirroring the Accounts Profile cell so
// a column scan reads like a tiny heatmap.
function ScoreCell({ score }: { score: number }) {
  const tone = scoreTone(score);
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-10 overflow-hidden rounded-full bg-bg-elevated">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(4, score)}%`, backgroundColor: tone.fg }}
        />
      </div>
      <span
        className="min-w-[1.75rem] text-right font-mono text-[12.5px] font-medium tabular-nums"
        style={{ color: tone.fg }}
      >
        {score}
      </span>
    </div>
  );
}

function freshestSignal(l: Lead): string | null {
  const summary = (l.signal_summary ?? []).filter(Boolean);
  if (summary.length > 0) return summary[0];
  const sigs = (l.signals ?? []) as Array<{ signal_type?: string }>;
  const t = sigs.find((s) => s?.signal_type)?.signal_type;
  return t ? signalTypeLabel(t) : null;
}

function RatingPill({ rating }: { rating: string | null }) {
  if (!rating || rating === "unrated")
    return <span className="text-text-muted">—</span>;
  const styles: Record<string, string> = {
    hot: "border-orange-400/40 bg-orange-400/10 text-orange-500",
    warm: "border-amber-400/40 bg-amber-400/10 text-amber-600",
    cold: "border-border-default bg-bg-elevated text-text-muted",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] capitalize",
        styles[rating] ?? styles.cold,
      )}
    >
      {rating}
    </span>
  );
}

export function PeopleView({
  filter = "all",
  allowedDomains = null,
}: {
  filter?: "monitored" | "all";
  /** Market scoping (multi_market pilot): when set, only people at these
   * account domains show — people follow their account's market. Null =
   * no market filter. */
  allowedDomains?: ReadonlySet<string> | null;
} = {}) {
  const { data: leads, isLoading } = useLeads();
  const [query, setQuery] = useState("");
  // Selected person → right-hand drawer (mirrors the Accounts pattern).
  const [selected, setSelected] = useState<Lead | null>(null);

  const rows = useMemo(() => {
    // Only people the user actually unlocked / enriched — not Vera's lead-gen.
    const acquired = (leads ?? [])
      .filter(isAcquiredPerson)
      .filter(
        (l) =>
          !allowedDomains ||
          allowedDomains.has((l.company_domain ?? "").toLowerCase()),
      );
    // Monitored sub-lens = the watched subset; All = every acquired person.
    const lens =
      filter === "monitored"
        ? acquired.filter((l) => l.person_monitoring)
        : acquired;
    const q = query.trim().toLowerCase();
    const filtered = q
      ? lens.filter((l) =>
          [fullName(l), l.title, l.company_name, l.company_industry]
            .filter(Boolean)
            .some((v) => (v as string).toLowerCase().includes(q)),
        )
      : lens;
    // Primary sort: score desc (as the engine ranks). Tie-break: people
    // with a photo first — purely cosmetic, only reorders within an
    // identical score, so the strongest-looking rows lead the table.
    return [...filtered].sort((a, b) => {
      const sa = Number(a.total_score ?? 0);
      const sb = Number(b.total_score ?? 0);
      if (sb !== sa) return sb - sa;
      const pa = a.photo_url ? 0 : 1;
      const pb = b.photo_url ? 0 : 1;
      return pa - pb;
    });
  }, [leads, query, filter, allowedDomains]);

  return (
    <div className="mt-4">
      <div className="mb-4 flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search
            size={14}
            strokeWidth={1.8}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people by name, title, company"
            className="w-full rounded-lg border border-border-default bg-bg-card py-2 pl-9 pr-3 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent/40"
          />
        </div>
        <span className="ml-auto text-[11px] text-text-muted">
          Sorted by score · highest first
        </span>
      </div>

      {isLoading ? (
        <div className="overflow-hidden rounded-2xl border border-border-default bg-bg-card">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-border-subtle px-5 py-4 last:border-b-0"
            >
              <div className="h-8 w-8 animate-pulse rounded-full bg-bg-elevated" />
              <div className="h-4 w-40 animate-pulse rounded bg-bg-elevated" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Users size={16} strokeWidth={1.6} />}
          title={
            query
              ? "No people match"
              : filter === "monitored"
                ? "No one monitored yet"
                : "No people yet"
          }
          body={
            query
              ? "Adjust your search."
              : filter === "monitored"
                ? "Hit Monitor on anyone to have Vera watch them weekly."
                : "People appear here once you unlock or enrich a contact — then monitor any of them in one click."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border-default bg-bg-card">
          {/* Header */}
          <div
            className={cn(
              "hidden items-center gap-x-5 border-b border-border-default py-2 pl-5 pr-5 text-[11px] text-text-muted md:grid",
              PEOPLE_COLS,
              PEOPLE_MIN_W,
            )}
          >
            <div
              className={cn(
                "-my-2 -ml-5 py-2 pl-5 pr-3 sticky left-0 z-10 bg-bg-card",
                STICKY_EDGE,
              )}
            >
              Person
            </div>
            <div>Job title</div>
            <div>Account</div>
            <div>Industry</div>
            <div>Country</div>
            <div className="text-right">Score</div>
            <div>Rating</div>
            <div>Freshest signal</div>
            <div />
          </div>

          {/* Rows */}
          {rows.slice(0, 100).map((l) => {
            const score = Math.round(Number(l.total_score ?? 0));
            const tone = scoreTone(score);
            const sig = freshestSignal(l);
            const name = fullName(l);
            return (
              <div
                key={l.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(l)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(l);
                  }
                }}
                className="group block w-full cursor-pointer text-left transition-colors hover:bg-accent/[0.04] focus:bg-accent/[0.04] focus:outline-none"
                aria-label={`Open ${name}`}
              >
                <div
                  className={cn(
                    "hidden items-center gap-x-5 border-b border-border-subtle py-2.5 pl-5 pr-5 last:border-b-0 md:grid",
                    PEOPLE_COLS,
                    PEOPLE_MIN_W,
                  )}
                >
                  {/* 1. Person (STICKY) */}
                  <div
                    className={cn(
                      // Hover bg MUST be opaque (color-mix, not a /60
                      // translucent) or the scrolled job-title column
                      // bleeds through the frozen cell on hover.
                      "flex min-w-0 items-center gap-2.5 -my-2.5 py-2.5 -ml-5 pl-5 pr-3 sticky left-0 z-10 self-stretch bg-bg-card transition-colors group-hover:bg-[color-mix(in_srgb,var(--accent)_4%,var(--bg-card))]",
                      STICKY_EDGE,
                    )}
                  >
                    <PersonAvatar photo={l.photo_url} name={name} />
                    <div className="min-w-0">
                      <div className="truncate font-display text-[13px] font-medium text-text-primary">
                        {name}
                      </div>
                      {/* Action chrome — mirrors the Accounts row: a LinkedIn
                          mark + an inline Monitor toggle, so a person can be
                          monitored straight from the row (no drawer). */}
                      <div className="mt-0.5 flex items-center gap-1">
                        {l.linkedin_url ? (
                          <a
                            href={l.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title={`Open ${name} on LinkedIn`}
                            aria-label={`Open ${name} on LinkedIn`}
                            className="shrink-0 rounded p-0.5 text-text-muted transition-colors hover:bg-bg-elevated hover:text-[#0a66c2]"
                          >
                            <LinkedinMark size={11} />
                          </a>
                        ) : null}
                        <PersonMonitorToggle lead={l} />
                      </div>
                    </div>
                  </div>

                  {/* 2. Title */}
                  <div className="min-w-0 truncate text-[12px] text-text-secondary">
                    {l.title ?? "—"}
                  </div>

                  {/* 3. Account — own click target → the account page,
                      not the person drawer (stopPropagation). */}
                  <div className="flex min-w-0 items-center gap-2">
                    {l.company_domain ? (
                      <a
                        href={`/dashboard/accounts/${encodeURIComponent(l.company_domain)}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex min-w-0 items-center gap-2 transition-colors hover:text-accent"
                        title={`Open ${l.company_name ?? l.company_domain}`}
                      >
                        <CompanyLogo domain={l.company_domain} name={l.company_name ?? ""} />
                        <span className="min-w-0 truncate text-[12.5px] text-text-secondary hover:text-accent hover:underline">
                          {l.company_name ?? "—"}
                        </span>
                      </a>
                    ) : (
                      <>
                        <CompanyLogo domain={l.company_domain} name={l.company_name ?? ""} />
                        <span className="min-w-0 truncate text-[12.5px] text-text-secondary">
                          {l.company_name ?? "—"}
                        </span>
                      </>
                    )}
                  </div>

                  {/* 4. Industry */}
                  <div className="min-w-0 truncate text-[12px] text-text-muted">
                    {l.company_industry ?? "—"}
                  </div>

                  {/* 5. Country */}
                  <div className="min-w-0 truncate text-[12px] text-text-muted">
                    {l.company_location ?? "—"}
                  </div>

                  {/* 6. Score */}
                  <ScoreCell score={score} />

                  {/* 7. Rating */}
                  <div className="min-w-0">
                    <RatingPill rating={l.lead_rating} />
                  </div>

                  {/* 8. Freshest signal */}
                  <div className="min-w-0 truncate text-[12px] text-text-secondary">
                    {sig ? (
                      <span title={sig}>{sig}</span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </div>

                  {/* 9. Open chevron */}
                  <ArrowUpRight
                    size={15}
                    strokeWidth={1.8}
                    className="shrink-0 text-text-muted transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-text-primary"
                  />
                </div>

                {/* Mobile: compact card */}
                <div className="flex items-center gap-3 border-b border-border-subtle px-5 py-3 md:hidden">
                  <PersonAvatar photo={l.photo_url} name={name} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-text-primary">
                      {name}
                    </div>
                    <div className="truncate text-[11.5px] text-text-muted">
                      {l.title ?? "—"} · {l.company_name ?? "—"}
                    </div>
                  </div>
                  <span
                    className="inline-flex min-w-[2.25rem] items-center justify-center rounded-md px-1.5 py-1 font-mono text-[11.5px] font-medium tabular-nums"
                    style={{ backgroundColor: tone.bg, color: tone.fg }}
                  >
                    {score}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PersonDrawer lead={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
