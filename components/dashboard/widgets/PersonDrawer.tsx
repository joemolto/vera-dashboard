"use client";

/**
 * PersonDrawer — right-hand slide-out for a person (2026-06-11).
 * Mirrors AccountDrawer's chrome so People and Accounts
 * share one interaction: click a row → preview panel, with a "View
 * full profile" button into the full dossier for depth.
 *
 * Intelligence-only: no outreach affordances. Shows who they are,
 * their score, and their freshest signals — the rep reads, then acts
 * in their own tooling.
 */

import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  ExternalLink,
  MapPin,
  Radar,
  X,
} from "lucide-react";
import { useState } from "react";
import { SendToButton } from "@/components/dashboard/widgets/SendToButton";
import { useLeadSignals, useWatchPerson } from "@/lib/dashboard/queries";
import { signalTypeLabel, proxiedAvatar } from "@/lib/dashboard/labels";
import { scoreTone } from "@/lib/dashboard/accountScore";
import { RelativeTime } from "@/components/dashboard/primitives";
import { cn } from "@/lib/utils";
import type { Lead } from "@/lib/dashboard/types";

function fullName(l: Lead): string {
  return [l.first_name, l.last_name].filter(Boolean).join(" ").trim() || "—";
}

export function PersonDrawer({
  lead,
  onClose,
}: {
  lead: Lead | null;
  onClose: () => void;
}) {
  const open = lead !== null;
  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-bg-base/60 backdrop-blur-sm transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        role="dialog"
        aria-label={lead ? `${fullName(lead)} preview` : "Person preview"}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border-default bg-bg-card shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.4)] transition-transform duration-200 sm:max-w-lg",
          open ? "translate-x-0" : "translate-x-full",
        )}
        aria-hidden={!open}
      >
        {lead ? <PersonBody lead={lead} onClose={onClose} /> : null}
      </aside>
    </>
  );
}

function PersonAvatar({ photo, name }: { photo: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const src = proxiedAvatar(photo);
  if (!src || failed) {
    return (
      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-bg-elevated text-[18px] font-medium text-text-primary">
        {(name.trim()[0] ?? "?").toUpperCase()}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      width={56}
      height={56}
      onError={() => setFailed(true)}
      className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
    />
  );
}

function PersonBody({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const router = useRouter();
  const { data: signals } = useLeadSignals(lead.id);
  const name = fullName(lead);
  const score = Math.round(Number(lead.total_score ?? 0));
  const tone = scoreTone(score);

  const summary = (lead.signal_summary ?? []).filter(Boolean);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-border-default p-5">
        <div className="flex min-w-0 items-start gap-3">
          <PersonAvatar photo={lead.photo_url} name={name} />
          <div className="min-w-0">
            <h2 className="truncate font-display text-[17px] font-semibold tracking-tight text-text-primary">
              {name}
            </h2>
            {lead.title ? (
              <p className="truncate text-[12.5px] text-text-secondary">
                {lead.title}
              </p>
            ) : null}
            {lead.company_name ? (
              <p className="mt-0.5 inline-flex items-center gap-1.5 text-[12px] text-text-muted">
                <Building2 size={12} strokeWidth={1.7} />
                {lead.company_domain ? (
                  <a
                    href={`/dashboard/accounts/${encodeURIComponent(lead.company_domain)}`}
                    className="truncate transition-colors hover:text-accent hover:underline"
                  >
                    {lead.company_name}
                  </a>
                ) : (
                  <span className="truncate">{lead.company_name}</span>
                )}
              </p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded-md p-1 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
        >
          <X size={16} strokeWidth={1.8} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* Score */}
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-border-subtle bg-bg-elevated/30 px-4 py-3">
          <div
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg font-mono text-[16px] font-semibold tabular-nums"
            style={{ backgroundColor: tone.bg, color: tone.fg }}
          >
            {score}
          </div>
          <div className="text-[12.5px] leading-snug">
            <span className="text-text-primary">Vera score</span>
            <div className="text-[11px] text-text-muted">
              Signal strength, fit & recency · 0–100
            </div>
          </div>
        </div>

        {/* Quick facts */}
        <dl className="mb-5">
          {lead.company_industry ? (
            <Fact Icon={Building2} label="Industry" value={lead.company_industry} />
          ) : null}
          {lead.company_location ? (
            <Fact Icon={MapPin} label="Location" value={lead.company_location} />
          ) : null}
          {lead.linkedin_url ? (
            <Fact
              Icon={ExternalLink}
              label="LinkedIn"
              valueNode={
                <a
                  href={lead.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent transition-colors hover:underline"
                >
                  View profile ↗
                </a>
              }
              last
            />
          ) : null}
        </dl>

        {/* Signals */}
        <div>
          <h3 className="mb-2 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-text-muted">
            <Radar size={13} strokeWidth={1.8} /> Signals
          </h3>
          {signals && signals.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {signals.slice(0, 8).map((s) => (
                <li
                  key={s.id}
                  className="rounded-lg border border-border-subtle bg-bg-elevated/30 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-text-primary">
                      {signalTypeLabel(s.signal_type)}
                    </span>
                    {s.detected_at ? (
                      <span className="shrink-0 text-[10.5px] text-text-muted">
                        <RelativeTime value={s.detected_at} />
                      </span>
                    ) : null}
                  </div>
                  {(() => {
                    const headline =
                      (s.signal_data as { headline?: string } | null)?.headline;
                    return headline ? (
                      <p className="mt-1 text-[11.5px] leading-snug text-text-secondary">
                        {headline}
                      </p>
                    ) : null;
                  })()}
                </li>
              ))}
            </ul>
          ) : summary.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {summary.map((s, i) => (
                <li key={i} className="text-[12px] text-text-secondary">
                  {s}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-text-muted">
              No signals on this person yet.
            </p>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex flex-col gap-2 border-t border-border-default p-4">
        <WatchToggle lead={lead} />
        <SendToButton id={lead.id} variant="drawer" />
        <button
          type="button"
          onClick={() => router.push(`/dashboard/prospects/${lead.id}`)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent/12 px-4 py-2.5 text-[13px] font-medium text-accent transition-colors hover:bg-accent/20"
        >
          View full profile <ArrowRight size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

// Watch / unwatch a person. Watching runs Vera's weekly person monitor on
// them. Free + reversible, so a plain toggle (not slide-to-confirm, which is
// reserved for payments + destructive actions). The Solo "People watched"
// cap is enforced server-side; an at-cap turn-on surfaces the cap message.
function WatchToggle({ lead }: { lead: Lead }) {
  const watch = useWatchPerson();
  const watching = !!lead.person_monitoring;
  const noLinkedIn = !lead.linkedin_url;
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => watch.mutate({ leadId: lead.id, active: !watching })}
        disabled={watch.isPending || (noLinkedIn && !watching)}
        className={cn(
          "inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-colors disabled:opacity-50",
          watching
            ? "border border-border-default text-text-secondary hover:bg-bg-elevated"
            : "bg-accent text-bg-base hover:opacity-90",
        )}
      >
        <Radar size={14} strokeWidth={1.9} />
        {watch.isPending
          ? "Saving…"
          : watching
            ? "Monitoring · stop"
            : "Monitor this person"}
      </button>
      {noLinkedIn && !watching ? (
        <p className="text-[11px] text-text-muted">
          Needs a LinkedIn profile to watch.
        </p>
      ) : null}
      {watch.isError ? (
        <p className="text-[11px] text-amber-500">
          Couldn&apos;t start watching. Try again.
        </p>
      ) : null}
    </div>
  );
}

function Fact({
  Icon,
  label,
  value,
  valueNode,
  last,
}: {
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  value?: string | null;
  valueNode?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 py-2",
        !last && "border-b border-border-subtle/40",
      )}
    >
      <span className="inline-flex items-center gap-1.5 text-[12px] text-text-muted">
        <Icon size={13} strokeWidth={1.7} />
        {label}
      </span>
      <span className="min-w-0 truncate text-right text-[12.5px] text-text-secondary">
        {valueNode ?? value}
      </span>
    </div>
  );
}
