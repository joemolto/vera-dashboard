"use client";

/**
 * PersonIntelControl — opt-in toggle for per-account LinkedIn person
 * monitoring. Sits at the top of the People tab on /dashboard/accounts/
 * [domain]. The buyer controls credit spend per
 * account, so flipping this on commits credits per monitor pass
 * (1 for top1, 2 for deep) — slide-to-confirm is mandatory.
 *
 * State:
 *   - off  → no Apify scraping (default)
 *   - top1 → monitor the highest-ICP-scoring contact only (+1 credit/pass)
 *   - deep → monitor top 3 contacts (+2 credits/pass)
 *
 * When `off`, shows the empty/enable card.
 * When on, shows the current mode + a downgrade/disable control.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users, Zap, Loader2, X, ChevronUp, ChevronDown,
  Lock, Mail, ArrowRight,
} from "lucide-react";
import {
  useAccountPersonIntel,
  useMyUnlocks,
  useSetPersonIntel,
  useUnlockContact,
  useUnlockedLeads,
  isLeadEnrichmentSettled,
  type PersonIntelMode,
} from "@/lib/dashboard/queries";
import { SlideToConfirm } from "@/components/ui/SlideToConfirm";
import { useOrg } from "@/components/dashboard/OrgContext";
import { cn } from "@/lib/utils";

interface PersonIntelControlProps {
  companyId: string | null | undefined;
  /** Used to build a Google fallback search link when a contact
   * row has no LinkedIn URL — without this we still link the rep
   * to a search, just less precise. */
  companyName?: string;
}

export function PersonIntelControl({ companyId, companyName }: PersonIntelControlProps) {
  const router = useRouter();
  const { features } = useOrg();
  // Cost framing by plan:
  //  - Solo: caps-based, never show credits (blank label).
  //  - Flat-rate (decoupled, non-Solo): predictable monthly figure.
  //  - Others: per-pass cost matching their variable cadence.
  const isSolo = !!features.solo_plan;
  const flat = !!features.decoupled_monitoring;
  const top1Cost = isSolo ? "" : flat ? "~4 credits/mo" : "+1 credit/pass";
  const deepCost = isSolo ? "" : flat ? "~8 credits/mo" : "+2 credits/pass";
  const { data, isLoading } = useAccountPersonIntel(companyId);
  const mutation = useSetPersonIntel();
  const unlock = useUnlockContact();
  const [pickingMode, setPickingMode] = useState<PersonIntelMode | null>(null);
  // Which contact row (by apollo_id) is in slide-to-confirm mode.
  // null = no row is gated; the inline action button just shows "Unlock".
  const [unlockingApolloId, setUnlockingApolloId] = useState<string | null>(null);

  // THIS org's unlock records — key_contacts is global (shared across
  // orgs) and carries discovery fields only, so unlocked/lead_id/email
  // must come from the org-scoped apollo_people_cache instead.
  const myUnlocks = useMyUnlocks();
  const unlockByApolloId = new Map(
    (myUnlocks.data ?? []).map((u) => [u.apollo_id, u]),
  );

  // Leads behind unlocked contacts — shows the enriched record (full
  // name, email, enriching state) inline on the row. Must run before
  // the early returns below (hooks rule); disabled until ids exist.
  const unlockedLeadIds = (data?.key_contacts ?? [])
    .map(
      (c) =>
        unlockByApolloId.get(String((c as { apollo_id?: string }).apollo_id ?? ""))
          ?.lead_id,
    )
    .filter((v): v is string => !!v);
  const unlockedLeadsQuery = useUnlockedLeads(unlockedLeadIds);
  const leadById = new Map(
    (unlockedLeadsQuery.data ?? []).map((l) => [l.id, l]),
  );

  if (!companyId) return null;
  if (isLoading) {
    return (
      <div className="rounded-xl border border-border-subtle bg-bg-card/40 p-5">
        <div className="h-5 w-40 animate-pulse rounded bg-bg-elevated" />
      </div>
    );
  }

  const mode = (data?.person_intel_enabled ?? "off") as PersonIntelMode;
  const contacts = data?.key_contacts ?? [];
  const lastRun = data?.last_person_intel_at;

  const handleConfirm = async (target: PersonIntelMode) => {
    await mutation.mutateAsync({ companyId, mode: target });
    setPickingMode(null);
  };

  // OFF state — show enablement card with mode selector
  if (mode === "off") {
    return (
      <div className="rounded-xl border border-border-subtle bg-bg-card/40 p-5">
        <div className="flex items-start gap-3">
          <Users size={18} className="mt-0.5 shrink-0 text-text-muted" strokeWidth={1.7} />
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-medium text-text-primary">
              Person intelligence
            </h3>
            <p className="mt-1 text-[12.5px] leading-snug text-text-secondary">
              Have Vera watch key contacts at this account for job changes, posts on relevant topics, and engagement with competitors.
            </p>

            {pickingMode === null ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPickingMode("top1")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-elevated px-3 py-1.5 text-[12px] font-medium text-text-primary transition-colors hover:border-accent/40"
                >
                  Top contact{top1Cost && <span className="text-text-muted"> · {top1Cost}</span>}
                </button>
                <button
                  type="button"
                  onClick={() => setPickingMode("deep")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-elevated px-3 py-1.5 text-[12px] font-medium text-text-primary transition-colors hover:border-accent/40"
                >
                  Top 3 contacts{deepCost && <span className="text-text-muted"> · {deepCost}</span>}
                </button>
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                <p className="text-[12px] text-text-muted">
                  Vera will watch{" "}
                  <span className="text-text-primary">
                    {pickingMode === "top1" ? "the top contact" : "the top 3 contacts"}
                  </span>{" "}
                  at this account
                  {isSolo ? (
                    "."
                  ) : (
                    <>
                      {" "}
                      <span className="font-mono text-text-primary">
                        {flat
                          ? pickingMode === "top1"
                            ? "~4 credits/mo"
                            : "~8 credits/mo"
                          : pickingMode === "top1"
                            ? "1 credit/pass"
                            : "2 credits/pass"}
                      </span>
                      .
                    </>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <SlideToConfirm
                    text="Slide to enable"
                    successText="Enabled"
                    onConfirm={() => handleConfirm(pickingMode)}
                    width={260}
                    height={42}
                  />
                  <button
                    type="button"
                    onClick={() => setPickingMode(null)}
                    aria-label="Cancel"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle text-text-muted transition-colors hover:bg-bg-elevated"
                  >
                    <X size={14} strokeWidth={1.7} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ON state — show current mode + downgrade/disable
  const modeLabel = mode === "top1" ? "Top contact" : "Top 3 contacts";
  const modeCostLabel = isSolo
    ? ""
    : flat
      ? mode === "top1"
        ? "~4 credits/mo"
        : "~8 credits/mo"
      : mode === "top1"
        ? "1 credit/pass"
        : "2 credits/pass";
  return (
    <div className="rounded-xl border border-accent/30 bg-accent/5 p-5">
      <div className="flex items-start gap-3">
        <Zap size={18} className="mt-0.5 shrink-0 text-accent" strokeWidth={1.7} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="text-[14px] font-medium text-text-primary">
              Person intelligence enabled
            </h3>
            <span className="font-mono text-[11px] text-text-muted">
              {modeLabel}
              {modeCostLabel ? ` · ${modeCostLabel}` : ""}
            </span>
          </div>
          {contacts.length > 0 ? (
            <>
              {/* Honest framing: if Apollo had no security people we
                  fell back to general leadership (CEO/CFO/CTO/etc) —
                  flag that so reps know they're seeing org leadership,
                  not security-matched contacts. */}
              {contacts.some(
                (c) => (c as { is_general_leadership?: boolean }).is_general_leadership,
              ) ? (
                <p className="mt-2 text-[11.5px] text-text-muted">
                  No security titles found at this account — showing senior leadership instead.
                </p>
              ) : null}
              <ul className="mt-3 flex flex-col gap-1.5">
                {contacts
                  .slice(0, mode === "top1" ? 1 : 3)
                  .map((c, i) => {
                    const apolloId = (c as { apollo_id?: string }).apollo_id;
                    const unlockRec = apolloId
                      ? unlockByApolloId.get(apolloId)
                      : undefined;
                    const isUnlocked = !!unlockRec;
                    const leadId = unlockRec?.lead_id ?? undefined;
                    const isGated =
                      !!apolloId && unlockingApolloId === apolloId;
                    // Enriched record behind an unlocked contact. Prefer
                    // the lead's revealed identity over the (possibly
                    // obfuscated) discovery name.
                    const lead = leadId ? leadById.get(leadId) : undefined;
                    const leadFullName = lead
                      ? [lead.first_name, lead.last_name]
                          .filter(Boolean)
                          .join(" ")
                          .trim()
                      : "";
                    const displayName = leadFullName || c.name;
                    const displayTitle = lead?.title || c.title;
                    const enriching =
                      !!lead &&
                      !isLeadEnrichmentSettled(lead) &&
                      Date.now() - new Date(lead.created_at).getTime() <
                        15 * 60_000;
                    // Name links to LinkedIn (or a Google fallback) so the
                    // rep can always inspect the person before spending a
                    // credit to unlock.
                    const href = c.linkedin_url
                      ? c.linkedin_url
                      : `https://www.google.com/search?q=${encodeURIComponent(
                          `site:linkedin.com/in "${displayName}" "${displayTitle}"${
                            companyName ? ` "${companyName}"` : ""
                          }`,
                        )}`;
                    return (
                      <li
                        key={`${apolloId || c.linkedin_url || c.name}-${i}`}
                        className="flex flex-col gap-1.5"
                      >
                        <div className="flex items-center justify-between gap-3 text-[12.5px]">
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group min-w-0 flex-1 truncate hover:underline"
                          >
                            <span className="font-medium text-text-primary">
                              {displayName}
                            </span>
                            {displayTitle ? (
                              <span className="text-text-muted"> · {displayTitle}</span>
                            ) : null}
                          </a>
                          {isUnlocked && leadId ? (
                            <button
                              type="button"
                              onClick={() => router.push(`/dashboard/prospects/${leadId}`)}
                              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] text-accent transition-colors hover:border-accent/50"
                            >
                              {enriching ? (
                                <>
                                  <Loader2
                                    size={10}
                                    strokeWidth={2}
                                    className="animate-spin"
                                    aria-hidden
                                  />
                                  Enriching…
                                </>
                              ) : (
                                <>
                                  View lead{" "}
                                  <ArrowRight size={10} strokeWidth={2} />
                                </>
                              )}
                            </button>
                          ) : apolloId ? (
                            <button
                              type="button"
                              onClick={() => setUnlockingApolloId(apolloId)}
                              disabled={unlock.isPending || isGated}
                              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border-default bg-bg-elevated px-2 py-1 text-[11px] text-text-primary transition-colors hover:border-accent/40 disabled:opacity-60"
                            >
                              <Lock size={10} strokeWidth={2} aria-hidden />
                              Unlock contact{isSolo ? "" : " · 1 credit"}
                            </button>
                          ) : (
                            <span className="shrink-0 text-[11px] text-text-muted">
                              {c.linkedin_url ? "LinkedIn ↗" : "Find on LinkedIn ↗"}
                            </span>
                          )}
                        </div>
                        {isUnlocked && (lead?.email || unlockRec?.email) ? (
                          <span className="inline-flex items-center gap-1.5 pl-0.5 text-[11px] text-text-muted">
                            <Mail size={10} strokeWidth={1.7} aria-hidden />
                            {lead?.email || unlockRec?.email}
                          </span>
                        ) : null}
                        {isGated && apolloId ? (
                          <div className="flex items-center gap-2 pl-1">
                            <SlideToConfirm
                              text={isSolo ? "Slide to unlock" : "Slide to unlock · 1 credit"}
                              successText="Unlocking…"
                              onConfirm={async () => {
                                try {
                                  const res = await unlock.mutateAsync({
                                    companyId,
                                    apolloId,
                                  });
                                  if (res?.lead_id) {
                                    router.push(`/dashboard/prospects/${res.lead_id}`);
                                  }
                                } finally {
                                  setUnlockingApolloId(null);
                                }
                              }}
                              width={240}
                              height={36}
                            />
                            <button
                              type="button"
                              onClick={() => setUnlockingApolloId(null)}
                              aria-label="Cancel"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-subtle text-text-muted transition-colors hover:bg-bg-elevated"
                            >
                              <X size={12} strokeWidth={1.7} />
                            </button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
              </ul>
            </>
          ) : (
            <p className="mt-2 inline-flex items-center gap-2 text-[12px] text-text-muted">
              <span
                className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent"
                aria-hidden
              />
              Finding contacts… should appear within a minute.
            </p>
          )}
          {lastRun ? (
            <p className="mt-2 text-[11px] text-text-muted">
              Last scan: <RelativeTimeBare value={lastRun} />
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            {mode === "deep" ? (
              <ModeChangeButton
                target="top1"
                label="Switch to Top contact only"
                icon={<ChevronDown size={12} strokeWidth={2} />}
                onConfirm={handleConfirm}
                pending={mutation.isPending}
              />
            ) : (
              <ModeChangeButton
                target="deep"
                label="Switch to Top 3 contacts"
                icon={<ChevronUp size={12} strokeWidth={2} />}
                onConfirm={handleConfirm}
                pending={mutation.isPending}
              />
            )}
            <DisableButton
              onConfirm={() => handleConfirm("off")}
              pending={mutation.isPending}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeChangeButton({
  target,
  label,
  icon,
  onConfirm,
  pending,
}: {
  target: PersonIntelMode;
  label: string;
  icon: React.ReactNode;
  onConfirm: (mode: PersonIntelMode) => Promise<void>;
  pending: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <SlideToConfirm
          text={`Slide to switch`}
          successText="Switched"
          onConfirm={async () => {
            await onConfirm(target);
            setConfirming(false);
          }}
          width={240}
          height={36}
        />
        <button
          type="button"
          onClick={() => setConfirming(false)}
          aria-label="Cancel"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-subtle text-text-muted hover:bg-bg-elevated"
        >
          <X size={12} strokeWidth={1.7} />
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => setConfirming(true)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-card px-3 py-1.5 text-[12px] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary",
        pending && "cursor-not-allowed opacity-50",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function DisableButton({
  onConfirm,
  pending,
}: {
  onConfirm: () => Promise<void>;
  pending: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <SlideToConfirm
          text="Slide to turn off"
          successText="Turned off"
          onConfirm={async () => {
            await onConfirm();
            setConfirming(false);
          }}
          width={240}
          height={36}
        />
        <button
          type="button"
          onClick={() => setConfirming(false)}
          aria-label="Cancel"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-subtle text-text-muted hover:bg-bg-elevated"
        >
          <X size={12} strokeWidth={1.7} />
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => setConfirming(true)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-card px-3 py-1.5 text-[12px] text-text-secondary transition-colors hover:border-red-400/40 hover:text-red-300",
        pending && "cursor-not-allowed opacity-50",
      )}
    >
      <X size={12} strokeWidth={1.7} />
      Turn off
    </button>
  );
}

function RelativeTimeBare({ value }: { value: string }) {
  // Lightweight inline relative time — avoids importing the bigger
  // RelativeTime component which expects extra context.
  try {
    const ms = Date.now() - new Date(value).getTime();
    const hours = Math.round(ms / (60 * 60 * 1000));
    if (hours < 1) return <>just now</>;
    if (hours < 24) return <>{hours}h ago</>;
    const days = Math.round(hours / 24);
    return <>{days}d ago</>;
  } catch {
    return null;
  }
}
